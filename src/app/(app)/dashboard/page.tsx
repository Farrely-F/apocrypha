import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

// All content lives behind the session check: anything rendered outside the
// Suspense boundary is prerendered into the static shell and would be sent to
// signed-out visitors.
async function Protected() {
  const { user } = await requireSession();
  return (
    <main>
      <h1>Protected</h1>
      <p>Signed in as {user.email}</p>
      <SignOutButton />
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Protected />
    </Suspense>
  );
}
