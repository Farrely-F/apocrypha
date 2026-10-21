import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Pane } from "@/components/shell";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getDefaultEnvironmentForUser } from "@/lib/workspace/queries";
import { environmentPath } from "@/lib/workspace/shared";

// All content lives behind the session check: anything rendered outside the
// Suspense boundary is prerendered into the static shell and would be sent to
// signed-out visitors. The dashboard has no content of its own yet: it sends
// the user to the first environment they hold a grant for.
async function Dashboard() {
  const { user } = await requireSession();
  const first = await getDefaultEnvironmentForUser(db, user.id);
  if (first) redirect(environmentPath(first));

  // A vault made before workspaces existed has no environment key, and the
  // server cannot make one: it has to be wrapped in the user's browser.
  return (
    <>
      <div className="mx-auto max-w-2xl pt-6">
        <Pane title="No workspace" meta={user.email}>
          <p className="text-bone">This account has a vault but no environment.</p>
          <p className="mt-2 max-w-[60ch] text-bone-dim">
            The vault was made before workspaces existed. An environment&apos;s key is created in
            your browser, so the server cannot add one for you.
          </p>
        </Pane>
      </div>
    </>
  );
}

// Reads the session (and redirects on it), so it cannot be prerendered into the static shell.
export const instant = false;

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
