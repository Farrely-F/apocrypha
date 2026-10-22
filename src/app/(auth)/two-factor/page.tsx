import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthStage } from "@/components/shell";
import { getSession } from "@/lib/auth/session";
import { TwoFactorScreen } from "./two-factor-screen";

// Someone who already has a session has nothing to prove here. The pending
// challenge lives in an HttpOnly cookie, so the page cannot know whether one
// exists; the code check answers that.
async function Gate() {
  if (await getSession()) redirect("/dashboard");
  return <TwoFactorScreen />;
}

// Reads the session (and redirects on it), so it cannot be prerendered into the static shell.
export const instant = false;

export default function TwoFactorPage() {
  return (
    <AuthStage>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </AuthStage>
  );
}
