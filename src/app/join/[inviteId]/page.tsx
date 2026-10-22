import { Suspense } from "react";
import { JoinScreen } from "./join-screen";

export const metadata = { title: "Join an organisation", robots: { index: false }, referrer: "no-referrer" };

type Params = Promise<{ inviteId: string }>;

async function Screen({ params }: { params: Params }) {
  const { inviteId } = await params;
  return <JoinScreen inviteId={inviteId} />;
}

export default function JoinPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Screen params={params} />
    </Suspense>
  );
}

// Rendered per request so it can carry the CSP nonce.
export const instant = false;
