import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getVaultRecord } from "@/lib/vault/store";

// The session read is request-time data, so with Cache Components it must sit
// behind a Suspense boundary. Pages still re-check via requireSession() close
// to their data: a layout alone is not an authorization boundary.
// No app screen is reachable until the account has a vault.
async function SessionGate({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  if (!(await getVaultRecord(db, user.id))) redirect("/vault/new");
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  );
}
