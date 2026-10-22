"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pane } from "@/components/shell";
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
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { formatWhen } from "@/lib/auth/device";
import { ActionError } from "./reauth-alert";

type Account = { id: string; providerId: string; createdAt: string };

const KNOWN = [
  { id: "google", name: "Google" },
  { id: "github", name: "GitHub" },
] as const;

/**
 * Which ways of signing in belong to this account. Either provider with the
 * same verified email is the same person; linking a second one means losing a
 * provider never locks you out.
 */
export function AccountsPane({
  accounts,
  providers,
  linkError,
}: {
  accounts: Account[];
  providers: Record<"google" | "github", boolean>;
  linkError?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(linkError ? { message: linkError } : null);
  const linked = new Map(accounts.map((a) => [a.providerId, a]));
  const only = accounts.length <= 1;
  // A password account only exists for local testing.
  const extra = accounts.filter((a) => !KNOWN.some((k) => k.id === a.providerId));

  async function link(provider: "google" | "github") {
    setError(null);
    setBusy(provider);
    const res = await authClient.linkSocial({ provider, callbackURL: "/settings" });
    if (res.error) {
      setBusy(null);
      setError({ code: res.error.code, message: res.error.message ?? "Could not start linking. Try again." });
    }
  }

  async function unlink(providerId: string) {
    const account = linked.get(providerId);
    if (!account) return;
    setError(null);
    setBusy(providerId);
    const res = await authClient.unlinkAccount({ accountId: account.id });
    setBusy(null);
    setConfirm(null);
    if (res.error) {
      setError({ code: res.error.code, message: res.error.message ?? "Could not unlink that account." });
      return;
    }
    router.refresh();
  }

  const name = (id: string) => KNOWN.find((k) => k.id === id)?.name ?? id;

  return (
    <Pane title="Sign-in methods" meta={`${accounts.length} linked`} flush className="bg-abyss/65 backdrop-blur-md">
      <ul className="divide-y divide-hairline-faint">
        {KNOWN.map((k) => {
          const a = linked.get(k.id);
          return (
            <li key={k.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-bone">{k.name}</p>
                <p className="text-xs text-bone-faint">{a ? `Linked ${formatWhen(a.createdAt)}` : providers[k.id] ? "Not linked" : "Not set up on this server"}</p>
              </div>
              <div className="ml-auto">
                {a ? (
                  <Button type="button" size="sm" variant="ghost" disabled={only || busy !== null} onClick={() => setConfirm(k.id)} title={only ? "It is your only way in" : undefined}>
                    Unlink
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled={!providers[k.id] || busy !== null} onClick={() => void link(k.id)}>
                    {busy === k.id ? "Opening" : "Link"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {extra.map((a) => (
          <li key={a.providerId} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-bone">{a.providerId === "credential" ? "Password (testing only)" : name(a.providerId)}</p>
              <p className="text-xs text-bone-faint">Linked {formatWhen(a.createdAt)}</p>
            </div>
          </li>
        ))}
      </ul>
      {(error || only) && (
        <div className="border-t border-hairline-faint px-5 py-3">
          {error ? <ActionError code={error.code} message={error.message} /> : <p className="text-xs text-bone-faint">Link a second provider before unlinking the first, so you can always sign in.</p>}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {confirm ? name(confirm) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to sign in with it. Your vault and secrets are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirm && void unlink(confirm)}>
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Pane>
  );
}
