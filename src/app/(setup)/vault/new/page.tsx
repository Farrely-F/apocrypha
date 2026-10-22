import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthStage } from "@/components/shell";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getVaultRecord } from "@/lib/vault/store";
import { CreateVaultForm } from "./create-vault-form";

async function Gate() {
  const { user } = await requireSession();
  if (await getVaultRecord(db, user.id)) redirect("/dashboard");
  return (
    <AuthStage wide>
      <CreateVaultForm email={user.email} />
    </AuthStage>
  );
}

// Reads the session (and redirects on it), so it cannot be prerendered into the static shell.
export const instant = false;

export default function NewVaultPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
