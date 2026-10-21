"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVault } from "@/components/vault/vault-provider";
import { generateEnvironmentKey, wrapEnvironmentKey } from "@/lib/crypto";
import { fetchEnvironmentKeys, fetchSecrets } from "@/lib/secrets/client";
import { openSecret } from "@/lib/secrets/seal";
import type { TreeOrg } from "@/lib/workspace/manage";

type Member = { userId: string; name: string; email: string; role: "owner" | "admin" | "member"; publicKey: string | null };
type Plan = { environments: { envId: string; envName: string; projectName: string; keyVersion: number; recipients: { userId: string; publicKey: string }[] }[] };
type Exposed = { env: string; names: string[] }[];

const ROLES = [
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

export function MembersDialog({ org, open, onOpenChange }: { org: TreeOrg; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { keyPair } = useVault();
  const [members, setMembers] = useState<Member[]>([]);
  const [prints, setPrints] = useState<Record<string, string>>({});
  const [me, setMe] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ who: string; exposed: Exposed } | null>(null);
  const myRole = members.find((m) => m.userId === me)?.role;

  const load = useCallback(async () => {
    try {
      const data = await call<{ members: Member[]; me: string }>(`/api/organizations/${org.id}/members`);
      setMembers(data.members);
      setMe(data.me);
      const next: Record<string, string> = {};
      for (const m of data.members) if (m.publicKey) next[m.userId] = await fingerprint(m.publicKey);
      setPrints(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [org.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    if (open) void load();
  }, [open, load]);

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

  // The browser reads what the person could see (for the checklist), makes a fresh key for every
  // environment they could open, and wraps it to everyone who stays. The server checks the recipients.
  async function remove(m: Member) {
    if (!keyPair) return setError("Unlock your vault first.");
    setBusy(true);
    setError(null);
    try {
      const { environments } = await call<Plan>(`/api/organizations/${org.id}/members/${m.userId}/removal`);
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
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setDone(null); setError(null); } onOpenChange(o); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Members of {org.name}</DialogTitle>
            <DialogDescription>
              Compare a fingerprint with the person to be sure you are sharing with the right key. Removing someone creates new keys for every environment they could open.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
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
              <DialogFooter>
                <Button onClick={() => setDone(null)}>Back to members</Button>
              </DialogFooter>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Key fingerprint</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="truncate">{m.name}{m.userId === me && <span className="text-bone-faint"> (you)</span>}</div>
                      <div className="truncate text-xs text-bone-faint">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      {myRole === "owner" && m.role !== "owner" && m.userId !== me ? (
                        <Select value={m.role} onValueChange={(v) => v && void setRole(m, v)} items={ROLES}>
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
                      {mayRemove(m) && (
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)} />}>
                            <UserMinus />
                          </TooltipTrigger>
                          <TooltipContent>Remove</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

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
