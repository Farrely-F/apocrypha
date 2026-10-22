import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Pane, PageSkeleton } from "@/components/shell";
import { ListView, RailNote } from "@/components/workspace/list-view";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { orgPath } from "@/lib/workspace/shared";

// All content lives behind the session check: anything rendered outside the
// Suspense boundary is prerendered into the static shell and would be sent to
// signed-out visitors.
async function Dashboard() {
  const { user } = await requireSession();
  const orgs = await listWorkspaceTree(db, user.id);

  // A vault made before workspaces existed has no environment key, and the
  // server cannot make one: it has to be wrapped in the user's browser.
  if (orgs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl pt-6">
        <Pane title="No workspace" meta={user.email}>
          <p className="text-bone">This account has a vault but no environment.</p>
          <p className="mt-2 max-w-[60ch] text-bone-dim">
            The vault was made before workspaces existed. An environment&apos;s key is created in
            your browser, so the server cannot add one for you.
          </p>
        </Pane>
      </div>
    );
  }

  return (
    <ListView
      crumbs={[{ label: "Apocrypha" }]}
      title="Organisations"
      summary={`${orgs.length} ${orgs.length === 1 ? "organisation" : "organisations"}, signed in as ${user.email}`}
      rail={
        <>
          <RailNote title="How it nests">
            <p className="text-bone">Organisation, project, environment.</p>
            <p>An organisation holds projects. A project holds environments such as dev, staging and prod.</p>
            <p>Each environment has its own key, and its secrets live inside it.</p>
          </RailNote>
          <RailNote title="Roles">
            <p>
              <span className="text-bone">owner</span> and <span className="text-bone">admin</span> manage members and access.
            </p>
            <p>
              <span className="text-bone">member</span> works in the environments they are given.
            </p>
          </RailNote>
        </>
      }
    >
      <Pane title="Your organisations" meta="open one" flush>
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Environments</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => (
              <TableRow key={o.id} className="group/row">
                <TableCell className="pl-5">
                  <Link href={orgPath(o.id)} className="text-bone transition-colors group-hover/row:text-signal">
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell className="text-bone-dim">{o.role}</TableCell>
                <TableCell className="text-right text-bone-dim">{o.projects.length}</TableCell>
                <TableCell className="text-right text-bone-dim">
                  {o.projects.reduce((n, p) => n + p.environments.length, 0)}
                </TableCell>
                <TableCell>
                  <ChevronRight aria-hidden className="size-4 text-bone-faint transition-colors group-hover/row:text-signal" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Pane>
    </ListView>
  );
}

// Reads the session, so it cannot be prerendered into the static shell.
export const instant = false;

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Dashboard />
    </Suspense>
  );
}
