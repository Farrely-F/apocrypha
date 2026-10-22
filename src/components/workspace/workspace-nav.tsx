"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, ScrollText, UserPlus, Users } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useVault } from "@/components/vault/vault-provider";
import { MembersDialog } from "@/components/workspace/members-dialog";
import { AuditSheet } from "@/components/workspace/audit-sheet";
import { InviteDialog } from "@/components/workspace/invite-dialog";
import { generateEnvironmentKey, wrapEnvironmentKey } from "@/lib/crypto";
import {
  newEnvironmentSchema,
  newOrganizationSchema,
  newProjectSchema,
  renameSchema,
  type NewEnvironmentValues,
  type NewOrganizationValues,
  type NewProjectValues,
  type RenameValues,
} from "@/lib/workspace/schemas";
import { FIRST_KEY_VERSION, environmentPath } from "@/lib/workspace/shared";
import type { TreeOrg } from "@/lib/workspace/manage";

type Where = { orgId: string; projectId: string; envId: string };

/** `/o/<org>/p/<project>/e/<env>` -> ids, or null off the environment pages. */
function parse(pathname: string): Where | null {
  const m = /^\/o\/([^/]+)\/p\/([^/]+)\/e\/([^/]+)/.exec(pathname);
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
    <div className="flex min-w-0 items-center gap-1 text-sm" aria-label="Location" role="navigation">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="hidden max-w-40 text-bone-faint sm:inline-flex" aria-label="Switch organisation" />}>
          {trigger(org.name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Organisations</DropdownMenuLabel>
            {tree.map((o) => {
              const first = o.projects[0]?.environments[0];
              return (
                <DropdownMenuItem
                  key={o.id}
                  disabled={!first}
                  render={first ? <Link href={environmentPath({ orgId: o.id, projectId: o.projects[0].id, envId: first.id })} /> : undefined}
                >
                  {o.id === org.id ? <Check /> : <span className="size-4" />}
                  <span className="truncate">{o.name}</span>
                  <span className="ml-auto text-xs text-bone-faint">{o.role}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setNewOrg(true)}>
            <Plus /> New organisation
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
          {trigger(project?.name ?? "Project")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {org.projects.map((p) => (
              <DropdownMenuItem key={p.id} render={<Link href={environmentPath({ orgId: org.id, projectId: p.id, envId: p.environments[0].id })} />}>
                {p.id === project?.id ? <Check /> : <span className="size-4" />}
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
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
          {canBuild && project && (
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

/** Make an environment key in the browser and wrap it to the signed-in user. Nothing else ever holds it. */
async function sealNewEnvironment(publicKey: string, name: string) {
  const envKey = generateEnvironmentKey();
  const id = crypto.randomUUID();
  try {
    const wrappedKey = await wrapEnvironmentKey(envKey, publicKey, { envId: id, keyVersion: FIRST_KEY_VERSION });
    return { id, name, wrappedKey };
  } finally {
    envKey.fill(0);
  }
}

async function post(url: string, body: unknown): Promise<Where> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as (Where & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? "The server could not save that. Try again.");
  return data;
}

function NewProjectDialog({
  open,
  onOpenChange,
  orgId,
  taken,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  taken: ReadonlySet<string>;
}) {
  const router = useRouter();
  const { keyPair } = useVault();
  const resolver = useMemo(() => zodResolver(newProjectSchema(taken)), [taken]);
  const form = useForm<NewProjectValues>({ resolver, defaultValues: { name: "", environment: "dev" } });
  const { isSubmitting, errors } = form.formState;

  async function onSubmit(values: NewProjectValues) {
    if (!keyPair) return form.setError("root.server", { message: "Unlock your vault first." });
    try {
      const environment = await sealNewEnvironment(keyPair.publicKey, values.environment);
      const made = await post("/api/projects", { orgId, name: values.name, environment });
      onOpenChange(false);
      form.reset({ name: "", environment: "dev" });
      router.push(environmentPath(made));
      router.refresh();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A project groups environments such as dev, staging and prod.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="New project">
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                  <Input {...field} id="project-name" placeholder="Billing API" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="environment"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-first-env">First environment</FieldLabel>
                  <Input {...field} id="project-first-env" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>You can add more later. It gets its own key, sealed to you.</FieldDescription>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          {errors.root?.server && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewEnvironmentDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  taken,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  taken: ReadonlySet<string>;
}) {
  const router = useRouter();
  const { keyPair } = useVault();
  const resolver = useMemo(() => zodResolver(newEnvironmentSchema(taken)), [taken]);
  const form = useForm<NewEnvironmentValues>({ resolver, defaultValues: { name: "" } });
  const { isSubmitting, errors } = form.formState;

  async function onSubmit(values: NewEnvironmentValues) {
    if (!keyPair) return form.setError("root.server", { message: "Unlock your vault first." });
    try {
      const env = await sealNewEnvironment(keyPair.publicKey, values.name);
      const made = await post(`/api/projects/${projectId}/environments`, env);
      onOpenChange(false);
      form.reset({ name: "" });
      router.push(environmentPath(made));
      router.refresh();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New environment</DialogTitle>
          <DialogDescription>In {projectName}. It gets its own key, sealed to you.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="New environment">
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="env-name">Environment name</FieldLabel>
                  <Input {...field} id="env-name" placeholder="staging" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          {errors.root?.server && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating" : "Create environment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Target = { id: string; name: string; url: string; siblings: string[] };

async function call(url: string, method: "PATCH" | "DELETE", body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The server could not do that. Try again.");
}

/** Rename (a form) or delete (a confirmation) of the current project or environment. */
function ManageDialog({
  kind,
  mode,
  target,
  onClose,
}: {
  kind: "project" | "environment";
  mode: "rename" | "delete";
  target: Target | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const taken = useMemo(() => new Set((target?.siblings ?? []).map((n) => n.toLowerCase())), [target]);
  const resolver = useMemo(() => zodResolver(renameSchema(taken, target?.name ?? "")), [taken, target]);
  const form = useForm<RenameValues>({ resolver, defaultValues: { name: target?.name ?? "" } });
  if (!target) return null;

  async function rename(values: RenameValues) {
    try {
      await call(target!.url, "PATCH", { name: values.name });
      onClose();
      router.refresh();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  async function remove() {
    try {
      await call(target!.url, "DELETE");
      onClose();
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (mode === "delete") {
    return (
      <AlertDialog open onOpenChange={(o) => !o && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {kind} {target.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "project"
                ? "Every environment in it and all of its secrets and history are destroyed."
                : "Its secrets and their history are destroyed."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete {kind}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(rename)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename {kind}</DialogTitle>
            <DialogDescription>Only the name changes. Keys and secrets stay as they are.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="rename-name">Name</FieldLabel>
                  <Input {...field} id="rename-name" autoFocus autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          {form.formState.errors.root?.server && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewOrganizationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { keyPair } = useVault();
  const form = useForm<NewOrganizationValues>({
    resolver: zodResolver(newOrganizationSchema),
    defaultValues: { organization: "", project: "First project", environment: "dev" },
  });

  async function onSubmit(values: NewOrganizationValues) {
    if (!keyPair) return form.setError("root.server", { message: "Unlock your vault first." });
    try {
      const environment = await sealNewEnvironment(keyPair.publicKey, values.environment);
      const made = await post("/api/organizations", { name: values.organization, projectName: values.project, environment });
      onOpenChange(false);
      form.reset();
      router.push(environmentPath(made));
      router.refresh();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  const fields = [
    { name: "organization", label: "Organisation name", description: "A team or company. You become its owner." },
    { name: "project", label: "First project", description: undefined },
    { name: "environment", label: "First environment", description: "Its key is created in this browser." },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New organisation</DialogTitle>
          <DialogDescription>Organisations keep projects and, soon, teammates apart.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="New organisation" className="grid gap-4">
          <FieldGroup>
            {fields.map((f, i) => (
              <Controller
                key={f.name}
                name={f.name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`org-${f.name}`}>{f.label}</FieldLabel>
                    <Input {...field} id={`org-${f.name}`} autoFocus={i === 0} autoComplete="off" aria-invalid={fieldState.invalid} />
                    {f.description && <FieldDescription>{f.description}</FieldDescription>}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
          {form.formState.errors.root?.server && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Create organisation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
