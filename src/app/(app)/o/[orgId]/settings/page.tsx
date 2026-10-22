import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpLeft } from "lucide-react";
import { PageSkeleton } from "@/components/shell";
import { DangerPane } from "@/components/org-settings/danger-pane";
import { GeneralPane } from "@/components/org-settings/general-pane";
import { MembersPane } from "@/components/org-settings/members-pane";
import { PermissionsPane } from "@/components/org-settings/permissions-pane";
import { Button } from "@/components/ui/button";
import { ListView } from "@/components/workspace/list-view";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listMembers } from "@/lib/members/store";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { isUuid, orgPath } from "@/lib/workspace/shared";

export const metadata = { title: "Organisation settings" };
export const instant = false;

type Params = Promise<{ orgId: string }>;

// Membership is read from the caller's own tree; an organisation that is not in it is a 404 that does not
// say whether it exists. What each control may do is decided again on the server when it is used.
async function OrgSettings({ params }: { params: Params }) {
  const { orgId } = await params;
  const { user } = await requireSession();
  if (!isUuid(orgId)) notFound();
  const org = (await listWorkspaceTree(db, user.id)).find((o) => o.id === orgId);
  if (!org) notFound();
  const members = (await listMembers(db, user.id, org.id)) ?? [];

  return (
    <ListView
      title={org.name}
      summary={`Organisation settings. You are ${org.role === "admin" ? "an" : "a"} ${org.role}.`}
      actions={
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={orgPath(org.id)} />}>
          <ArrowUpLeft data-icon="inline-start" />
          Projects
        </Button>
      }
    >
      <div className="grid gap-6">
        <MembersPane org={org} role={org.role} />
        <PermissionsPane role={org.role} />
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <GeneralPane org={org} role={org.role} />
          <DangerPane org={org} role={org.role} members={members.length} />
        </div>
      </div>
    </ListView>
  );
}

export default function OrgSettingsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <OrgSettings params={params} />
    </Suspense>
  );
}
