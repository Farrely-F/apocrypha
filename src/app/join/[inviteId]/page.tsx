import { JoinScreen } from "./join-screen";

export const metadata = { title: "Join an organisation", robots: { index: false }, referrer: "no-referrer" };

export default async function JoinPage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  return <JoinScreen inviteId={inviteId} />;
}
