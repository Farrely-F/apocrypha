"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useVault } from "./vault-provider";

/** Wipes the stored key first, then ends the session, so a trusted device does not stay open. */
export function useSignOut() {
  const { lock } = useVault();
  return useCallback(async () => {
    await lock();
    await authClient.signOut();
  }, [lock]);
}

export function SignOutButton() {
  const router = useRouter();
  const signOut = useSignOut();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        await signOut();
        router.replace("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
