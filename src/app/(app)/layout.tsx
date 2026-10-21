import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";

// The session read is request-time data, so with Cache Components it must sit
// behind a Suspense boundary. Pages still re-check via requireSession() close
// to their data: a layout alone is not an authorization boundary.
async function SessionGate({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  );
}
