import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { AppGround, ShellHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { decideAdmin } from "@/lib/system/admin";

// The administrator's pages hold other people's metadata, so they are rendered per request (and can carry the
// per-request CSP nonce, see lib/security/csp.ts). They sit outside the vault frame on purpose: nothing here is
// encrypted, so no vault key is needed or held while they are open.
//
// The check is here, before any chrome is drawn, so a visitor who is not the administrator gets the ordinary 404
// (status and body) and never sees that tabs called "System" or "People" exist. Each page checks again: a layout is
// not an authorization boundary. A listed administrator with an old sign-in gets the frame and the "sign in again" page.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getSession();
  const status = session ? decideAdmin({ email: session.user.email, emailVerified: session.user.emailVerified, sessionCreatedAt: session.session.createdAt }).status : "not-admin";
  if (status !== "ok" && status !== "stale") notFound();
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <AppGround />
      </div>
      <ShellHeader
        className="relative z-10"
        nav={<AdminNav />}
        actions={
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
            Back to the app
          </Button>
        }
      />
      <main id="main" className="relative z-10 flex-1 p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
