import { Suspense } from "react";
import { ShareScreen } from "./share-screen";

export const metadata = { title: "Shared secrets", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Params = Promise<{ shareId: string }>;

async function Screen({ params }: { params: Params }) {
  const { shareId } = await params;
  return <ShareScreen shareId={shareId} />;
}

// Public: a guest needs no account. The key is in the URL fragment, which this server never sees.
// `params` is request-time data, so it is read behind Suspense (Cache Components).
export default function SharePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Screen params={params} />
    </Suspense>
  );
}
