"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionError } from "@/components/settings/reauth-alert";
import { Pane } from "@/components/shell";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { OrgRole } from "@/lib/db/schema";
import type { TreeOrg } from "@/lib/workspace/manage";

/** Deleting an organisation removes it for everyone in it. Owners only, and the name is typed back. */
export function DangerPane({ org, role, members }: { org: TreeOrg; role: OrgRole; members: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const environments = org.projects.reduce((n, p) => n + p.environments.length, 0);

  async function destroy() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/organizations/${org.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: typed }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      setError({ code: body?.code, message: body?.error ?? "Could not delete the organisation. Try again." });
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Pane title="Delete organisation" tone="danger" className="bg-abyss/65 backdrop-blur-md">
      <p className="text-bone-dim">
        Removes {org.name} with every project, environment, secret and version in it, its invites and share links, and its audit
        log. Everyone loses access at once. There is no undo, and we cannot recover it.
      </p>
      <div className="mt-5">
        <Button type="button" size="sm" variant="destructive" disabled={role !== "owner"} onClick={() => setOpen(true)}>
          Delete {org.name}
        </Button>
        {role !== "owner" && <p className="mt-2 text-xs text-bone-faint">Only an owner can delete an organisation.</p>}
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
          if (!o) {
            setTyped("");
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {members > 1 ? `${members - 1} other ${members - 1 === 1 ? "person" : "people"} will lose access. ` : ""}
              {environments} {environments === 1 ? "environment" : "environments"} and every secret in {environments === 1 ? "it" : "them"} will be
              erased. Export what you need first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="confirm-org-name">Type {org.name} to confirm</FieldLabel>
            <Input id="confirm-org-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          {error && <ActionError code={error.code} message={error.message} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy || typed !== org.name} onClick={() => void destroy()}>
              {busy ? "Deleting" : "Delete forever"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Pane>
  );
}
