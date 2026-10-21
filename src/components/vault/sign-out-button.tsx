"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useVault } from "./vault-provider";

/** Signs out and wipes the stored key first, so a trusted device does not stay open. */
export function SignOutButton() {
  const router = useRouter();
  const { lock } = useVault();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        await lock();
        await authClient.signOut();
        router.replace("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
