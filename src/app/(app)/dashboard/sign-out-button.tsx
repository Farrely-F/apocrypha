"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
