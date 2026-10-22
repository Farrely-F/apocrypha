"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { lock as lockStore } from "@/lib/vault/unlocked";
import type { ErasePlan, OrgFate } from "@/lib/account/erase";
import { ActionError } from "./reauth-alert";

/** A copy of the personal data held about the account, as a JSON file. */
export function DownloadPane() {
  return (
    <Pane title="Your data" className="bg-abyss/65 backdrop-blur-md">
      <p className="text-bone-dim">
        Download a copy of the personal data we hold about you: your profile, how you sign in, where you are signed in, your
        memberships and the audit entries about you. Secrets are not in it, because we only hold them sealed; export an
        environment from its own page to read it.
      </p>
      <div className="mt-5">
        <Button nativeButton={false} size="sm" variant="outline" render={<a href="/api/account/export" download />}>
          <Download data-icon="inline-start" />
          Download my data
        </Button>
      </div>
    </Pane>
  );
}

type Preview = { email: string } & ErasePlan;
type Failure = { code?: string; message: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Erase the account and its personal data. It first asks the server what that would do to each organisation,
 * says so in plain words, refuses while the person is the only owner of a team, and wants the email typed.
 */
export function ErasePane() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function begin() {
    setOpen(true);
    setPreview(null);
    setFailure(null);
    setTyped("");
    const res = await fetch("/api/account", { cache: "no-store" });
    if (!res.ok) return setFailure({ message: "Could not check what erasing would do. Try again." });
    setPreview((await res.json()) as Preview);
  }

  async function erase() {
    setBusy(true);
    setFailure(null);
    const res = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string; blocked?: OrgFate[] } | null;
    if (!res.ok) {
      setBusy(false);
      if (res.status === 409 && body?.blocked) setPreview((p) => (p ? { ...p, blocked: body.blocked!, orgs: p.orgs.map((o) => body.blocked!.find((b) => b.orgId === o.orgId) ?? o) } : p));
      return setFailure({ code: body?.code, message: body?.error ?? "Could not erase the account. Nothing was changed." });
    }
    // The key goes from this browser first, then the session; this tab must not flash the unlock screen on the way out.
    await lockStore().catch(() => null);
    await authClient.signOut().catch(() => null);
    router.replace("/goodbye");
  }

  const blocked = preview?.blocked ?? [];
  const deleting = preview?.orgs.filter((o) => o.action === "delete") ?? [];
  const leaving = preview?.orgs.filter((o) => o.action === "leave") ?? [];
  const confirmed = preview != null && typed.trim().toLowerCase() === preview.email.toLowerCase();

  return (
    <Pane title="Erase account" tone="danger" className="bg-abyss/65 backdrop-blur-md">
      <p className="text-bone-dim">
        Permanently erases your account, your vault and the personal data tied to it. Organisations you are alone in are deleted
        with everything in them. There is no undo, and nobody, including us, can recover it.
      </p>
      <div className="mt-5">
        <Button type="button" size="sm" variant="destructive" onClick={() => void begin()}>
          Erase my account
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-xl" bodyClassName="gap-4">
          <DialogHeader>
            <DialogTitle>Erase your account?</DialogTitle>
            <DialogDescription>This is what happens, organisation by organisation.</DialogDescription>
          </DialogHeader>

          {!preview && !failure && <p className="text-sm text-bone-faint">Checking your organisations</p>}

          {preview && (
            <div className="grid gap-4 text-sm">
              {blocked.length > 0 && (
                <Alert variant="destructive" data-testid="erase-blocked">
                  <AlertDescription className="grid gap-2">
                    <span>You are the only owner of {plural(blocked.length, "organisation", "organisations")} that still {blocked.length === 1 ? "has" : "have"} other people. Make someone else an owner, or delete the organisation, then come back.</span>
                    <ul className="grid gap-1">
                      {blocked.map((o) => (
                        <li key={o.orgId}>
                          <Link href={`/o/${o.orgId}/settings`} className="underline underline-offset-4" onClick={() => setOpen(false)}>
                            {o.name}
                          </Link>{" "}
                          <span className="text-bone-faint">({plural(o.members - 1, "other member", "other members")})</span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {deleting.length > 0 && (
                <div>
                  <p className="text-bone">Deleted with you</p>
                  <ul className="mt-1 grid gap-1 text-bone-dim">
                    {deleting.map((o) => (
                      <li key={o.orgId}>
                        {o.name}: {plural(o.environments, "environment", "environments")} and every secret in {o.environments === 1 ? "it" : "them"}. You are the only member.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {leaving.length > 0 && (
                <div>
                  <p className="text-bone">You leave</p>
                  <ul className="mt-1 grid gap-1 text-bone-dim">
                    {leaving.map((o) => (
                      <li key={o.orgId}>{o.name}: {plural(o.members - 1, "other member", "other members")} {o.members - 1 === 1 ? "keeps" : "keep"} everything.</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-bone-faint">
                    Teammates keep the secrets you could read, and you may hold copies of what you already opened. Ask an owner to rotate
                    anything sensitive at its source.
                  </p>
                </div>
              )}
              {preview.orgs.length === 0 && <p className="text-bone-dim">You belong to no organisation.</p>}

              <div>
                <p className="text-bone">Erased</p>
                <p className="mt-1 text-bone-dim">
                  Your account, vault keys, linked sign-in methods, two-step secret, sessions, memberships, the share links and unused invites you made, and invites sent to your email.
                </p>
              </div>
              <div>
                <p className="text-bone">Kept, without your name or email</p>
                <p className="mt-1 text-bone-dim">
                  In organisations that continue, the audit log keeps an anonymous id where you acted, and secret versions keep an anonymous author id. The log is a chain of hashes, so entries cannot be edited. Backups taken earlier may hold your data until they are rotated out.
                </p>
              </div>

              <Field>
                <FieldLabel htmlFor="confirm-erase">Type {preview.email} to confirm</FieldLabel>
                <Input id="confirm-erase" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} disabled={blocked.length > 0 || busy} />
              </Field>
            </div>
          )}

          {failure && <ActionError code={failure.code} message={failure.message} />}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button type="button" variant="destructive" disabled={!confirmed || blocked.length > 0 || busy} onClick={() => void erase()}>
              {busy ? "Erasing" : "Erase everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Pane>
  );
}
