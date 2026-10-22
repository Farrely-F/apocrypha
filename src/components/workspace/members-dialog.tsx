"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MembersManager } from "@/components/workspace/members-manager";
import type { TreeOrg } from "@/lib/workspace/manage";

export function MembersDialog({ org, open, onOpenChange }: { org: TreeOrg; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Members of {org.name}</DialogTitle>
          <DialogDescription>
            Compare a fingerprint with the person to be sure you are sharing with the right key. Removing someone creates new keys for every environment they could open.
          </DialogDescription>
        </DialogHeader>
        <MembersManager org={org} active={open} />
      </DialogContent>
    </Dialog>
  );
}
