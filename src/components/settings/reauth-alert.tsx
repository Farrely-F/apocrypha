"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SigningOut, useSignOut } from "@/components/vault/sign-out-button";
import { twoFactorErrorMessage } from "@/lib/auth/schemas";

/** An action error. When it is "sign in again", the way to do that is one click away. */
export function ActionError({ code, message }: { code?: string; message?: string }) {
  const [signOut, signingOut] = useSignOut();
  const stale = code === "RECENT_SIGN_IN_REQUIRED";
  return (
    <Alert variant="destructive" data-testid="action-error">
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{stale ? twoFactorErrorMessage(code) : (message ?? twoFactorErrorMessage(code))}</span>
        {stale && (
          <Button type="button" size="xs" variant="outline" onClick={() => void signOut()}>
            Sign out and in again
          </Button>
        )}
      </AlertDescription>
      {signingOut && <SigningOut />}
    </Alert>
  );
}
