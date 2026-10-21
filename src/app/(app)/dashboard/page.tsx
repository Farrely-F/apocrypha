import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

async function Identity() {
  const { user } = await requireSession();
  return <p>Signed in as {user.email}</p>;
}

export default function DashboardPage() {
  return (
    <main>
      <h1>Protected</h1>
      <Suspense fallback={null}>
        <Identity />
      </Suspense>
      <SignOutButton />
    </main>
  );
}
