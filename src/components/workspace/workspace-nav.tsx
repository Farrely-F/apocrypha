"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpLeft, Check, ChevronsUpDown, Pencil, Plus, Trash2, ScrollText, Settings, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MembersDialog } from "@/components/workspace/members-dialog";
import { AuditSheet } from "@/components/workspace/audit-sheet";
import { InviteDialog } from "@/components/workspace/invite-dialog";
import {
  ManageDialog,
  NewEnvironmentDialog,
  NewOrganizationDialog,
  NewProjectDialog,
} from "@/components/workspace/workspace-dialogs";
import { environmentPath, orgPath, projectPath } from "@/lib/workspace/shared";
import type { TreeOrg } from "@/lib/workspace/manage";

/** Any `/o/<org>` path -> the workspace it points at, at whatever depth. */
type Location = { orgId: string; projectId?: string; envId?: string };
function parse(pathname: string): Location | null {
  const m = /^\/o\/([^/]+)(?:\/p\/([^/]+))?(?:\/e\/([^/]+))?/.exec(pathname);
  return m ? { orgId: m[1], projectId: m[2], envId: m[3] } : null;
}

/** The trigger look shared by both switchers: name, then a small chevron. */
const trigger = (children: React.ReactNode) => (
  <>
    <span className="truncate">{children}</span>
    <ChevronsUpDown className="size-3 shrink-0 text-bone-faint" />
  </>
);

/**
 * Header switcher: which project and environment you are looking at, and a way
 * to make new ones. The tree only lists environments you hold a key for.
 */
export function WorkspaceNav({ tree }: { tree: TreeOrg[] }) {
  const [newOrg, setNewOrg] = useState(false);
  const [invite, setInvite] = useState(false);
  const [members, setMembers] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const pathname = usePathname();
  const where = parse(pathname);
  const org = tree.find((o) => o.id === where?.orgId) ?? null;
  const project = org?.projects.find((p) => p.id === where?.projectId) ?? null;
  const env = project?.environments.find((e) => e.id === where?.envId) ?? null;
  const canBuild = org ? org.role === "owner" || org.role === "admin" : false;
  const [newProject, setNewProject] = useState(false);
  const [newEnv, setNewEnv] = useState(false);
  const [manage, setManage] = useState<{ kind: "project" | "environment"; mode: "rename" | "delete" } | null>(null);

  if (!org) return null;

  return (
    <div data-tour="workspace" className="flex min-w-0 items-center gap-1 text-sm" aria-label="Location" role="navigation">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" data-tour="org" className="hidden max-w-40 text-bone-faint sm:inline-flex" aria-label="Switch organisation" />}>
          {trigger(org.name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Organisations</DropdownMenuLabel>
            {tree.map((o) => {
              const first = o.projects[0]?.environments[0];
              const href = first
                ? environmentPath({ orgId: o.id, projectId: o.projects[0].id, envId: first.id })
                : orgPath(o.id);
              return (
                <DropdownMenuItem key={o.id} render={<Link href={href} />}>
                  {o.id === org.id ? <Check /> : <span className="size-4" />}
                  <span className="truncate">{o.name}</span>
                  <span className="ml-auto text-xs text-bone-faint">{o.role}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <ArrowUpLeft /> All organisations
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNewOrg(true)}>
            <Plus /> New organisation
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`${orgPath(org.id)}/settings`} />}>
            <Settings /> Organisation settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMembers(true)}>
            <Users /> Members
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAuditOpen(true)}>
            <ScrollText /> Audit log
          </DropdownMenuItem>
          {canBuild && (
            <DropdownMenuItem onClick={() => setInvite(true)}>
              <UserPlus /> Invite to {org.name}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewOrganizationDialog open={newOrg} onOpenChange={setNewOrg} />
      {canBuild && <InviteDialog org={org} open={invite} onOpenChange={setInvite} />}
      <MembersDialog org={org} open={members} onOpenChange={setMembers} />
      <AuditSheet org={org} open={auditOpen} onOpenChange={setAuditOpen} />
      <span aria-hidden className="hidden text-bone-faint sm:inline">/</span>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-48" aria-label="Switch project" />}>
          {trigger(project?.name ?? "Projects")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {org.projects.map((p) => (
              <DropdownMenuItem key={p.id} render={<Link href={projectPath(org.id, p.id)} />}>
                {p.id === project?.id ? <Check /> : <span className="size-4" />}
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {project && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href={orgPath(org.id)} />}>
                <ArrowUpLeft /> All projects
              </DropdownMenuItem>
            </>
          )}
          {canBuild && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNewProject(true)}>
                <Plus /> New project
              </DropdownMenuItem>
              {project && (
                <>
                  <DropdownMenuItem onClick={() => setManage({ kind: "project", mode: "rename" })}>
                    <Pencil /> Rename project
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setManage({ kind: "project", mode: "delete" })}>
                    <Trash2 /> Delete project
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {project && env && (
        <>
          <span aria-hidden className="text-bone-faint">/</span>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-40 text-signal" aria-label="Switch environment" />}>
          {trigger(env?.name ?? "Environment")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Environments in {project?.name}</DropdownMenuLabel>
            {project?.environments.map((e) => (
              <DropdownMenuItem key={e.id} render={<Link href={environmentPath({ orgId: org.id, projectId: project.id, envId: e.id })} />}>
                {e.id === env?.id ? <Check /> : <span className="size-4" />}
                <span className="truncate">{e.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href={projectPath(org.id, project.id)} />}>
            <ArrowUpLeft /> All environments
          </DropdownMenuItem>
          {canBuild && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNewEnv(true)}>
                <Plus /> New environment
              </DropdownMenuItem>
              {env && (
                <>
                  <DropdownMenuItem onClick={() => setManage({ kind: "environment", mode: "rename" })}>
                    <Pencil /> Rename environment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={project.environments.length < 2}
                    onClick={() => setManage({ kind: "environment", mode: "delete" })}
                  >
                    <Trash2 /> Delete environment
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {project && (
        <NewEnvironmentDialog
          open={newEnv}
          onOpenChange={setNewEnv}
          projectId={project.id}
          projectName={project.name}
          taken={new Set(project.environments.map((e) => e.name.toLowerCase()))}
        />
      )}

      {manage && project && (
        <ManageDialog
          key={`${manage.kind}-${manage.mode}`}
          {...manage}
          target={
            manage.kind === "project"
              ? { id: project.id, name: project.name, url: `/api/projects/${project.id}`, siblings: org.projects.map((p) => p.name) }
              : env
                ? { id: env.id, name: env.name, url: `/api/environments/${env.id}`, siblings: project.environments.map((e) => e.name) }
                : null
          }
          onClose={() => setManage(null)}
        />
      )}
      <NewProjectDialog
        open={newProject}
        onOpenChange={setNewProject}
        orgId={org.id}
        taken={new Set(org.projects.map((p) => p.name.toLowerCase()))}
      />
    </div>
  );
}
