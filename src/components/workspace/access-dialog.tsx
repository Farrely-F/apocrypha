"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVault } from "@/components/vault/vault-provider";
import { generateEnvironmentKey, wrapEnvironmentKey } from "@/lib/crypto";
import { fetchEnvironmentKeys } from "@/lib/secrets/client";
import type { Level } from "@/lib/members/access";

type Person = { userId: string; name: string; email: string; publicKey: string | null };
type Table = { environments: { envId: string; envName: string; projectName: string }[]; members: { userId: string; levels: Record<string, Level> }[] };
type Plan = { current: Level; publicKey: string; currentKeyVersion: number; keyVersions: number[]; recipients: { userId: string; publicKey: string }[] };

const LEVELS = [
  { value: "none", label: "No access" },
  { value: "read", label: "Can read" },
  { value: "write", label: "Can read and write" },
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "The server could not do that. Try again.");
  return body;
}

/**
 * Per-environment access for one member: none, read (holds the key) or read and write. Giving access
 * wraps the key to their key here in the browser; taking it away rotates the environment key to a new
 * version for everyone who keeps access, so they keep nothing that opens what is written next.
 */
export function AccessDialog({
  orgId,
  member,
  people,
  changed,
  onClose,
}: {
  orgId: string;
  member: Person;
  /** Everyone in the org, as listed: recipients of a new key must match this list. */
  people: Person[];
  /** People whose key changed since this browser last saw it: never share with them until accepted. */
  changed: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { keyPair } = useVault();
  const [table, setTable] = useState<Table | null>(null);
  const [busyEnv, setBusyEnv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTable(await call<Table>(`/api/organizations/${orgId}/access`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orgId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    void load();
  }, [load]);

  async function change(envId: string, level: Level) {
    if (!keyPair) return setError("Unlock your vault first.");
    setBusyEnv(envId);
    setError(null);
    setNotice(null);
    try {
      const plan = await call<Plan>(`/api/organizations/${orgId}/members/${member.userId}/access?env=${envId}`);
      if (plan.current === level) return;
      const base = `/api/organizations/${orgId}/members/${member.userId}/access`;
      if (plan.current === "none") {
        // Giving access: their key must be the one we were shown, and not one that changed unnoticed.
        if (plan.publicKey !== member.publicKey || changed.includes(member.userId)) {
          throw new Error("This person's key does not match what you were shown, or changed since you last saw it. Compare fingerprints in the members list first.");
        }
        const keys = await fetchEnvironmentKeys(envId, keyPair);
        try {
          const grants = [];
          for (const v of plan.keyVersions) {
            const key = keys.get(v);
            if (!key) throw new Error("You cannot open this environment.");
            grants.push({ keyVersion: v, wrappedKey: await wrapEnvironmentKey(key, plan.publicKey, { envId, keyVersion: v }) });
          }
          await call(base, { method: "POST", body: JSON.stringify({ envId, level, grants }) });
        } finally {
          keys.forEach((k) => k.fill(0));
        }
      } else if (level === "none") {
        // Taking access away: a new key version for everyone who stays, each checked against the list.
        const listed = new Map(people.map((p) => [p.userId, p.publicKey]));
        for (const r of plan.recipients) {
          if (listed.get(r.userId) !== r.publicKey || changed.includes(r.userId)) {
            throw new Error("A recipient's key does not match what you were shown. Nothing was changed. Check the fingerprints and reload.");
          }
        }
        const fresh = generateEnvironmentKey();
        try {
          const nv = plan.currentKeyVersion + 1;
          const rotation = await Promise.all(plan.recipients.map(async (r) => ({ userId: r.userId, wrappedKey: await wrapEnvironmentKey(fresh, r.publicKey, { envId, keyVersion: nv }) })));
          await call(base, { method: "POST", body: JSON.stringify({ envId, level, rotation }) });
        } finally {
          fresh.fill(0);
        }
        setNotice(`${member.name} no longer has access. The key was rotated, so rotate any secrets they could already read at the source.`);
      } else {
        await call(base, { method: "POST", body: JSON.stringify({ envId, level }) });
      }
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyEnv(null);
    }
  }

  const mine = table?.members.find((m) => m.userId === member.userId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Environment access for {member.name}</DialogTitle>
          <DialogDescription>
            Reading means holding the environment key. Writing is allowed on top of that. Taking access away rotates the key.
          </DialogDescription>
        </DialogHeader>
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
        <div className="grid gap-3">
          {table && table.environments.length === 0 && <p className="text-bone-faint">You cannot open any environment here, so there is nothing to share.</p>}
          {table?.environments.map((e) => (
            <div key={e.envId} className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate">
                <span className="text-bone-faint">{e.projectName} / </span>
                {e.envName}
              </div>
              <Select value={mine?.levels[e.envId] ?? "none"} onValueChange={(v) => v && void change(e.envId, v as Level)} items={LEVELS} disabled={busyEnv !== null}>
                <SelectTrigger aria-label={`Access to ${e.envName}`} className="w-48 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
