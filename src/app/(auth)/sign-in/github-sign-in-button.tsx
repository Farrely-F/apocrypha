"use client";

import { authClient } from "@/lib/auth/client";

export function GithubSignInButton() {
  return (
    <button
      type="button"
      onClick={() =>
        authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" })
      }
    >
      Continue with GitHub
    </button>
  );
}
