"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Pane } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { InviteDialog } from "@/components/workspace/invite-dialog";
import { MembersManager } from "@/components/workspace/members-manager";
import type { OrgRole } from "@/lib/db/schema";
import type { TreeOrg } from "@/lib/workspace/manage";

/** The people in the organisation, with their roles and access, on a page of their own. */
export function MembersPane({ org, role }: { org: TreeOrg; role: OrgRole }) {
  const [inviting, setInviting] = useState(false);
  const canInvite = role === "owner" || role === "admin";
  return (
    <Pane title="Members" meta={role} className="bg-abyss/65 backdrop-blur-md">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-bone-dim">
          Compare a key fingerprint with the person before sharing. Removing someone creates new keys for every environment
          they could open.
        </p>
        {canInvite && (
          <Button type="button" size="sm" onClick={() => setInviting(true)}>
            <UserPlus data-icon="inline-start" />
            Invite
          </Button>
        )}
      </div>
      <MembersManager org={org} />
      {canInvite && <InviteDialog org={org} open={inviting} onOpenChange={setInviting} />}
    </Pane>
  );
}
