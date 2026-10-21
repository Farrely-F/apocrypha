import { Suspense } from "react";
import { redirect } from "next/navigation";
import { VaultFrame } from "@/components/vault";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getVaultRecord } from "@/lib/vault/store";

// The session read is request-time data, so with Cache Components it must sit
// behind a Suspense boundary. Pages still re-check via requireSession() close
// to their data: a layout alone is not an authorization boundary.
// No app screen is reachable until the account has a vault.
async function SessionGate({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const vault = await getVaultRecord(db, user.id);
  if (!vault) redirect("/vault/new");
  // The frame shows the unlock screen while the vault is locked and the
  // content once the key is open. Locking is a client concern: the key never
  // reaches the server, so this boundary cannot enforce it.
  return (
    <VaultFrame email={user.email} publicKey={vault.publicKey}>
      {children}
    </VaultFrame>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  );
}
