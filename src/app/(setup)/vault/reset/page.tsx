import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthStage } from "@/components/shell";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getVaultRecord } from "@/lib/vault/store";
import { ResetFlow } from "./reset-flow";

// Reads the session (and redirects on it), so it cannot be prerendered into the static shell.
export const instant = false;

async function Gate() {
  const { user } = await requireSession();
  if (!(await getVaultRecord(db, user.id))) redirect("/vault/new");
  return (
    <AuthStage wide>
      <ResetFlow email={user.email} />
    </AuthStage>
  );
}

export default function ResetVaultPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
