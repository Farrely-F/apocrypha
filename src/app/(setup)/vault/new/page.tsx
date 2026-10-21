import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell, ShellHeader, StatusBar } from "@/components/shell";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getVaultRecord } from "@/lib/vault/store";
import { CreateVaultForm } from "./create-vault-form";

async function Gate() {
  const { user } = await requireSession();
  if (await getVaultRecord(db, user.id)) redirect("/dashboard");
  return (
    <AppShell
      header={<ShellHeader />}
      status={<StatusBar lock="locked" />}
    >
      <CreateVaultForm email={user.email} />
    </AppShell>
  );
}

export default function NewVaultPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
