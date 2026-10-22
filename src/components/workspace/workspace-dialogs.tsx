"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useVault } from "@/components/vault/vault-provider";
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
import { FIRST_KEY_VERSION, environmentPath, type WorkspaceIds } from "@/lib/workspace/shared";

/** Make an environment key in the browser and wrap it to the signed-in user. */
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

async function post(url: string, body: unknown): Promise<WorkspaceIds> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as (WorkspaceIds & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? "The server could not save that. Try again.");
  return data;
}

async function call(url: string, method: "PATCH" | "DELETE", body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The server could not do that. Try again.");
}

export function NewOrganizationButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        New organisation
      </Button>
      <NewOrganizationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function NewProjectButton({ orgId, taken, size = "sm" }: { orgId: string; taken: string[]; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        New project
      </Button>
      <NewProjectDialog open={open} onOpenChange={setOpen} orgId={orgId} taken={new Set(taken)} />
    </>
  );
}

export function NewEnvironmentButton({
  projectId,
  projectName,
  taken,
  size = "sm",
}: {
  projectId: string;
  projectName: string;
  taken: string[];
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        New environment
      </Button>
      <NewEnvironmentDialog open={open} onOpenChange={setOpen} projectId={projectId} projectName={projectName} taken={new Set(taken)} />
    </>
  );
}

/** Row menu for a project: rename or delete, with the same dialogs as the header. */
export function ProjectRowActions({
  project,
  siblings,
  canBuild,
  redirect,
}: {
  project: { id: string; name: string };
  siblings: string[];
  canBuild: boolean;
  redirect?: string;
}) {
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  if (!canBuild) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="[&_svg]:size-4"
              aria-label={`Manage ${project.name}`}
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setMode("rename")}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setMode("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {mode && (
        <ManageDialog
          key={mode}
          kind="project"
          mode={mode}
          target={{ id: project.id, name: project.name, url: `/api/projects/${project.id}`, siblings }}
          redirect={redirect}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}

/** Row menu for an environment: keep at least one in the project. */
export function EnvironmentRowActions({
  environment,
  siblings,
  canBuild,
  redirect,
}: {
  environment: { id: string; name: string };
  siblings: string[];
  canBuild: boolean;
  redirect?: string;
}) {
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  if (!canBuild) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="[&_svg]:size-4"
              aria-label={`Manage ${environment.name}`}
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setMode("rename")}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={siblings.length < 2} onClick={() => setMode("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {mode && (
        <ManageDialog
          key={mode}
          kind="environment"
          mode={mode}
          target={{ id: environment.id, name: environment.name, url: `/api/environments/${environment.id}`, siblings }}
          redirect={redirect}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}

export function NewProjectDialog({
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

export function NewEnvironmentDialog({
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

export function ManageDialog({
  kind,
  mode,
  target,
  redirect,
  onClose,
}: {
  kind: "project" | "environment";
  mode: "rename" | "delete";
  target: Target | null;
  redirect?: string;
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
      router.push(redirect ?? "/dashboard");
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
            <AlertDialogTitle>
              Delete {kind} {target.name}?
            </AlertDialogTitle>
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

export function NewOrganizationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
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
