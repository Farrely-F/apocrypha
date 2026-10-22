"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CreateVaultForm } from "../new/create-vault-form";

type Env = { envId: string; envName: string; projectName: string; orgName: string };
type Impact = { recoverable: Env[]; waiting: Env[]; lost: (Env & { managed: boolean })[] };

function List({ envs }: { envs: Env[] }) {
  return (
    <ul className="mt-2 list-disc pl-5">
      {envs.length ? envs.map((e) => <li key={e.envId}>{label(e)}</li>) : <li className="text-bone-faint">nothing</li>}
    </ul>
  );
}

const label = (e: Env) => `${e.orgName} / ${e.projectName} / ${e.envName}`;

/** Lost the passphrase and the recovery key: say plainly what is lost, then make a new vault. */
export function ResetFlow({ email }: { email: string }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [go, setGo] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/vault/reset", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (Impact & { error?: string }) | null;
        if (!live) return;
        if (!res.ok || !body) return setError(body?.error ?? "Could not load what a reset would affect.");
        setImpact(body);
      })
      .catch(() => live && setError("Could not reach the server."));
    return () => {
      live = false;
    };
  }, []);

  if (go) return <CreateVaultForm email={email} mode="reset" />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-6">
      <Pane title="Reset your vault" tone="danger" meta={email}>
        <p className="text-bone-dim">
          Use this only if you lost your passphrase and your recovery key. It makes a new key pair. Your old key can never be recovered, so what only that key
          could open is gone for good.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {impact && (
          <div className="mt-5 grid gap-5 text-sm">
            <div>
              <div className="text-signal">Can be restored by an admin ({impact.recoverable.length})</div>
              <p className="mt-1 text-bone-faint">An owner or admin who still has access must re-share each one with your new key. Until then you cannot open them.</p>
              <List envs={impact.recoverable} />
            </div>
            <div>
              <div className="text-bone">Waiting for an admin who can open them ({impact.waiting.length})</div>
              <p className="mt-1 text-bone-faint">Teammates hold these but no owner or admin does yet. They are kept, and you get access back once an admin can open them.</p>
              <List envs={impact.waiting} />
            </div>
            <div>
              <div className="text-blood">Lost for good ({impact.lost.length})</div>
              <p className="mt-1 text-bone-faint">Nobody else holds a key, so these can never be read again. Ones in organisations you manage are deleted. Ones where you are only a member are left in place, unreadable.</p>
              <List envs={impact.lost} />
            </div>
            <Field>
              <FieldLabel htmlFor="reset-confirm">Type RESET to continue</FieldLabel>
              <Input id="reset-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="max-w-48" />
              <FieldDescription>You will then choose a new passphrase and get a new recovery key.</FieldDescription>
            </Field>
            <div className="flex items-center gap-3">
              <Button variant="destructive" disabled={typed.trim() !== "RESET"} onClick={() => setGo(true)}>
                Continue
              </Button>
              <Button nativeButton={false} variant="ghost" render={<Link href="/dashboard" />}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Pane>
    </div>
  );
}
