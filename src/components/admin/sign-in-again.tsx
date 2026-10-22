"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { lock } from "@/lib/vault/unlocked";

/** The administrator's sign-in is too old: end it, and any key kept in this browser with it, and go to sign in. */
export function SignInAgain() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await lock().catch(() => null);
        await authClient.signOut().catch(() => null);
        router.replace("/sign-in");
      }}
    >
      {busy ? "Signing out" : "Sign out and sign in again"}
    </Button>
  );
}
