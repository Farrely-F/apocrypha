"use client";

import { authClient } from "@/lib/auth/client";

/**
 * Whether the visitor already has a session. The landing page is static, so
 * this is read in the browser after load; until it answers, visitors are shown
 * the signed-out wording.
 */
export function useSignedIn() {
  const { data } = authClient.useSession();
  return Boolean(data?.user);
}
