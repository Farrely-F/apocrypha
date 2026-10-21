"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { generateEnvironmentKey, wrapEnvironmentKey } from "@/lib/crypto";
import {
  newEnvironmentSchema,
  newProjectSchema,
  type NewEnvironmentValues,
  type NewProjectValues,
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
  const pathname = usePathname();
  const where = parse(pathname);
  const org = tree.find((o) => o.id === where?.orgId) ?? null;
  const project = org?.projects.find((p) => p.id === where?.projectId) ?? null;
  const env = project?.environments.find((e) => e.id === where?.envId) ?? null;
  const canBuild = org ? org.role === "owner" || org.role === "admin" : false;
  const [newProject, setNewProject] = useState(false);
  const [newEnv, setNewEnv] = useState(false);

  if (!org) return null;

  return (
    <div className="flex min-w-0 items-center gap-1 text-sm" aria-label="Location" role="navigation">
      <span className="hidden truncate px-2 text-bone-faint sm:inline" title="Organisation">
        {org.name}
      </span>
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
