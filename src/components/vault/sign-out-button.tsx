"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { lock as lockStore } from "@/lib/vault/unlocked";
import { useVault } from "./vault-provider";

/**
 * Sign out: the stored key leaves this browser first, then the session ends, then the page changes. The key is
 * removed through the store, not the provider's `lock()`: that flips the whole app to the unlock screen, which
 * is what used to flash up for a few seconds before the sign-in page arrived. `pending` is for a covering
 * message while that happens.
 *
 * If the session cannot be ended (offline, server error) the vault is locked instead, so the screen shows the
 * truth: the key is gone from this browser either way.
 */
export function useSignOut() {
  const router = useRouter();
  const { lock } = useVault();
  const [pending, setPending] = useState(false);
  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await lockStore();
      const res = await authClient.signOut();
      if (res?.error) throw new Error(res.error.message);
      router.replace("/sign-in");
    } catch {
      setPending(false);
      await lock();
    }
  }, [lock, router]);
  return [signOut, pending] as const;
}

/** Covers the app while signing out, so nothing in it is shown as if still open. */
export function SigningOut() {
  return (
    <div role="status" className="fixed inset-0 z-[80] grid place-items-center bg-abyss/95 text-sm text-bone-dim">
      <p>
        Signing out <span aria-hidden className="mora-caret" />
      </p>
    </div>
  );
}

export function SignOutButton() {
  const [signOut, pending] = useSignOut();
  return (
    <>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void signOut()}>
        Sign out
      </Button>
      {pending && <SigningOut />}
    </>
  );
}
