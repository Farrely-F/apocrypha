"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, SlidersHorizontal, UserMinus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVault } from "@/components/vault/vault-provider";
import { AccessDialog } from "@/components/workspace/access-dialog";
import { acceptKeys, checkPins } from "@/lib/members/pins";
import { generateEnvironmentKey, wrapEnvironmentKey } from "@/lib/crypto";
import { fetchEnvironmentKeys, fetchSecrets } from "@/lib/secrets/client";
import { openSecret } from "@/lib/secrets/seal";
import type { TreeOrg } from "@/lib/workspace/manage";

type Member = { userId: string; name: string; email: string; role: "owner" | "admin" | "member"; publicKey: string | null };
type Plan = { environments: { envId: string; envName: string; projectName: string; keyVersion: number; recipients: { userId: string; publicKey: string }[] }[] };
type Exposed = { env: string; names: string[] }[];

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "The server could not do that. Try again.");
  return body;
}

/** First 8 bytes of SHA-256 of the public key, as hex pairs: compare it with the person out of band. */
async function fingerprint(publicKey: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicKey))).slice(0, 8);
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Everything about the people in an organisation: who they are, their key fingerprints, roles, per-
 * environment access, re-sharing after a reset and removal with key rotation. The dialog and the
 * organisation settings page both render this, so there is one set of rules in the browser as well as on
 * the server.
 */
export function MembersManager({ org, active = true }: { org: TreeOrg; active?: boolean }) {
  const router = useRouter();
  const { keyPair } = useVault();
  const [members, setMembers] = useState<Member[]>([]);
  const [prints, setPrints] = useState<Record<string, string>>({});
  const [me, setMe] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<string[]>([]);
  const [needsAccess, setNeedsAccess] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessFor, setAccessFor] = useState<Member | null>(null);
  const [promoting, setPromoting] = useState<Member | null>(null);
  const [done, setDone] = useState<{ who: string; exposed: Exposed } | null>(null);
  const myRole = members.find((m) => m.userId === me)?.role;

  const load = useCallback(async () => {
    try {
      const data = await call<{ members: Member[]; me: string; needsAccess: string[] }>(`/api/organizations/${org.id}/members`);
      setNeedsAccess(data.needsAccess);
      setMembers(data.members);
      setMe(data.me);
      setChanged(checkPins(org.id, data.members));
      const next: Record<string, string> = {};
      for (const m of data.members) if (m.publicKey) next[m.userId] = await fingerprint(m.publicKey);
      setPrints(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [org.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when shown
    if (active) void load();
  }, [active, load]);

  const mayRemove = (m: Member) => m.userId !== me && ((myRole === "owner" && m.role !== "owner") || (myRole === "admin" && m.role === "member"));

  async function setRole(m: Member, role: string) {
    setError(null);
    try {
      await call(`/api/organizations/${org.id}/members/${m.userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // After someone resets their vault their old grants are gone, and their old key may be lost or stolen,
  // so re-sharing also rotates: a new key version for everyone who holds a current key plus the member's
  // NEW key, and the older versions for the member so history stays readable.
  async function regrant(m: Member) {
    if (!keyPair) return setError("Unlock your vault first.");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (changed.includes(m.userId)) throw new Error("This person's key changed, as expected after a reset. Compare the new fingerprint with them, then accept it above before sharing.");
      const plan = await call<{
        publicKey: string;
        environments: { envId: string; envName: string; projectName: string; currentKeyVersion: number; keyVersions: number[]; recipients: { userId: string; publicKey: string }[] }[];
        skipped: string[];
      }>(`/api/organizations/${org.id}/members/${m.userId}/regrant`);
      if (plan.publicKey !== m.publicKey) throw new Error("The key the server returned does not match the one in the members list. Nothing was shared.");
      const listed = new Map(members.map((x) => [x.userId, x.publicKey]));
      const envs = [];
      for (const env of plan.environments) {
        for (const r of env.recipients) {
          if (r.userId === m.userId || listed.get(r.userId) !== r.publicKey || changed.includes(r.userId)) {
            throw new Error("A recipient's key does not match what you were shown. Nothing was changed. Check the fingerprints and reload.");
          }
        }
        const keys = await fetchEnvironmentKeys(env.envId, keyPair);
        const fresh = generateEnvironmentKey();
        try {
          const nv = env.currentKeyVersion + 1;
          const forTarget = [];
          for (const v of env.keyVersions) {
            const key = keys.get(v);
            if (!key) throw new Error(`You cannot open ${env.projectName} / ${env.envName}.`);
            forTarget.push({ keyVersion: v, wrappedKey: await wrapEnvironmentKey(key, plan.publicKey, { envId: env.envId, keyVersion: v }) });
          }
          forTarget.push({ keyVersion: nv, wrappedKey: await wrapEnvironmentKey(fresh, plan.publicKey, { envId: env.envId, keyVersion: nv }) });
          const forOthers = await Promise.all(
            env.recipients.map(async (r) => ({ userId: r.userId, wrappedKey: await wrapEnvironmentKey(fresh, r.publicKey, { envId: env.envId, keyVersion: nv }) })),
          );
          envs.push({ envId: env.envId, forTarget, forOthers });
        } finally {
          fresh.fill(0);
          keys.forEach((k) => k.fill(0));
        }
      }
      await call(`/api/organizations/${org.id}/members/${m.userId}/regrant`, { method: "POST", body: JSON.stringify({ envs }) });
      setNotice(
        `${m.name || m.email} can open ${plan.environments.map((e) => `${e.projectName} / ${e.envName}`).join(", ")} again, with a new key version.` +
          (plan.skipped.length ? ` Still waiting on someone who can open: ${plan.skipped.join(", ")}.` : ""),
      );
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The browser reads what the person could see (for the checklist), makes a fresh key for every
  // environment they could open, and wraps it to everyone who stays. The server checks the recipients.
  async function remove(m: Member) {
    if (!keyPair) return setError("Unlock your vault first.");
    setBusy(true);
    setError(null);
    try {
      const { environments } = await call<Plan>(`/api/organizations/${org.id}/members/${m.userId}/removal`);
      // The server names who gets the new key. Refuse anyone who is not a listed member, is the
      // person being removed, or whose key differs from the one listed and pinned for them.
      const listed = new Map(members.map((x) => [x.userId, x.publicKey]));
      for (const env of environments) {
        for (const r of env.recipients) {
          if (r.userId === m.userId || listed.get(r.userId) !== r.publicKey || changed.includes(r.userId)) {
            throw new Error("A recipient's key does not match what you were shown. Nothing was changed. Check the fingerprints and reload.");
          }
        }
      }
      const exposed: Exposed = [];
      for (const env of environments) {
        const keys = await fetchEnvironmentKeys(env.envId, keyPair);
        const opened = await Promise.all((await fetchSecrets(env.envId)).map((row) => openSecret(keys, env.envId, row)));
        exposed.push({ env: `${env.projectName} / ${env.envName}`, names: opened.flatMap((o) => (o.ok ? [o.name] : [])).sort() });
        keys.forEach((k) => k.fill(0));
      }
      const rotations = [];
      for (const env of environments) {
        const key = generateEnvironmentKey();
        try {
          const ctx = { envId: env.envId, keyVersion: env.keyVersion + 1 };
          const grants = await Promise.all(env.recipients.map(async (r) => ({ userId: r.userId, wrappedKey: await wrapEnvironmentKey(key, r.publicKey, ctx) })));
          rotations.push({ envId: env.envId, grants });
        } finally {
          key.fill(0);
        }
      }
      await call(`/api/organizations/${org.id}/members/${m.userId}`, { method: "DELETE", body: JSON.stringify({ rotations }) });
      setRemoving(null);
      setDone({ who: m.name || m.email, exposed });
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {changed.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription className="grid gap-2">
            <span>
              The key changed since you last saw it for {changed.map((id) => members.find((x) => x.userId === id)?.name ?? id).join(", ")}. Confirm the new fingerprint with them before removing anyone or sharing keys.
            </span>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => { acceptKeys(org.id, members); setChanged([]); }}>
              I verified it, accept the new key
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {done ? (
        <div className="grid gap-3 text-sm">
          <Alert>
            <AlertDescription>
              {done.who} was removed and their access to these environments is cut off for everything written from now on. They may still hold copies of what they already read, so rotate these at the source:
            </AlertDescription>
          </Alert>
          {done.exposed.length === 0 && <p className="text-bone-faint">They could not open any environment.</p>}
          {done.exposed.map((e) => (
            <div key={e.env}>
              <div className="text-bone">{e.env}</div>
              <ul className="mt-1 list-disc pl-5 text-bone-faint">
                {e.names.length ? e.names.map((n) => <li key={n} className="font-mono">{n}</li>) : <li>no secrets</li>}
              </ul>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => setDone(null)}>Back to members</Button>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Key fingerprint</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell>
                  <div className="truncate">
                    {m.name}
                    {m.userId === me && <span className="text-bone-faint"> (you)</span>}
                    {needsAccess.includes(m.userId) && <span className="ml-2 text-xs text-blood">needs access</span>}
                  </div>
                  <div className="truncate text-xs text-bone-faint">{m.email}</div>
                </TableCell>
                <TableCell>
                  {myRole === "owner" && m.role !== "owner" && m.userId !== me ? (
                    <Select value={m.role as string} onValueChange={(v) => v && (v === "owner" ? setPromoting(m) : void setRole(m, v))} items={ROLES}>
                      <SelectTrigger aria-label={`Role of ${m.name}`} className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{m.role}</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-bone-faint">{prints[m.userId] ?? "..."}</TableCell>
                <TableCell>
                  <span className="flex justify-end gap-1">
                  {m.role === "member" && m.userId !== me && (myRole === "owner" || myRole === "admin") && (
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Environment access for ${m.name}`} onClick={() => setAccessFor(m)} />}>
                        <SlidersHorizontal />
                      </TooltipTrigger>
                      <TooltipContent>Environment access</TooltipContent>
                    </Tooltip>
                  )}
                  {needsAccess.includes(m.userId) && (
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Re-grant access to ${m.name}`} onClick={() => void regrant(m)} />}>
                        <ShieldCheck />
                      </TooltipTrigger>
                      <TooltipContent>Re-grant access</TooltipContent>
                    </Tooltip>
                  )}
                  {mayRemove(m) && (
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)} />}>
                        <UserMinus />
                      </TooltipTrigger>
                      <TooltipContent>Remove</TooltipContent>
                    </Tooltip>
                  )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </div>

      {accessFor && <AccessDialog orgId={org.id} member={accessFor} people={members} changed={changed} onClose={() => setAccessFor(null)} />}

      <AlertDialog open={!!promoting} onOpenChange={(o) => !o && setPromoting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make {promoting?.name} an owner?</AlertDialogTitle>
            <AlertDialogDescription>
              Owners can change roles, rename or delete {org.name}, and read its audit chain. An owner can never be demoted or removed by anyone else, so only do this for someone you trust fully. It also lets you leave later without stranding the organisation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const who = promoting;
                setPromoting(null);
                if (who) void setRole(who, "owner");
              }}
            >
              Make owner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && !busy && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to {org.name} now. Every environment they could open gets a new key, so nothing written from now on is readable by them. You will see a list of what they could already read.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy || !keyPair} onClick={(e) => { e.preventDefault(); if (removing) void remove(removing); }}>
              {busy ? "Rotating keys" : "Remove and rotate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
