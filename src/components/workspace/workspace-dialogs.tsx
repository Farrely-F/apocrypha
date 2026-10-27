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
import { Textarea } from "@/components/ui/textarea";
import { KindSelect, TagInput } from "@/components/workspace/details-fields";
import { useVault } from "@/components/vault/vault-provider";
import { generateEnvironmentKey, wrapEnvironmentKey } from "@/lib/crypto";
import { inferKind, MAX_DESCRIPTION, type EnvKind, type ProjectDetails } from "@/lib/workspace/meta";
import {
  editEnvironmentSchema,
  editProjectSchema,
  newEnvironmentSchema,
  newOrganizationSchema,
  newProjectSchema,
  type EditEnvironmentValues,
  type EditProjectValues,
  type NewEnvironmentValues,
  type NewOrganizationValues,
  type NewProjectValues,
} from "@/lib/workspace/schemas";
import { FIRST_KEY_VERSION, environmentPath, type WorkspaceIds } from "@/lib/workspace/shared";

/** Make an environment key in the browser and wrap it to the signed-in user. */
async function sealNewEnvironment(publicKey: string, name: string, kind?: EnvKind) {
  const envKey = generateEnvironmentKey();
  const id = crypto.randomUUID();
  try {
    const wrappedKey = await wrapEnvironmentKey(envKey, publicKey, { envId: id, keyVersion: FIRST_KEY_VERSION });
    return { id, name, wrappedKey, ...(kind && { kind }) };
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

export function NewProjectButton({
  orgId,
  taken,
  tags = [],
  size = "sm",
}: {
  orgId: string;
  taken: string[];
  /** Tags already used in the organisation, offered as one-click suggestions. */
  tags?: string[];
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        New project
      </Button>
      <NewProjectDialog open={open} onOpenChange={setOpen} orgId={orgId} taken={new Set(taken)} suggestions={tags} />
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

/** Header button: edit the project's name and details. */
export function EditProjectButton({
  project,
  siblings,
  tags = [],
  label = "Edit details",
}: {
  project: { id: string; name: string } & ProjectDetails;
  siblings: string[];
  tags?: string[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil data-icon="inline-start" />
        {label}
      </Button>
      {open && <EditProjectDialog project={project} siblings={siblings} suggestions={tags} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Row menu for a project: rename or delete, with the same dialogs as the header. */
export function ProjectRowActions({
  project,
  siblings,
  tags = [],
  canBuild,
  redirect,
}: {
  project: { id: string; name: string } & ProjectDetails;
  siblings: string[];
  tags?: string[];
  canBuild: boolean;
  redirect?: string;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
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
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setMode("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {mode === "edit" && <EditProjectDialog project={project} siblings={siblings} suggestions={tags} onClose={() => setMode(null)} />}
      {mode === "delete" && (
        <ManageDialog
          kind="project"
          target={{ id: project.id, name: project.name, url: `/api/projects/${project.id}` }}
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
  environment: { id: string; name: string; kind: EnvKind };
  siblings: string[];
  canBuild: boolean;
  redirect?: string;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
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
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={siblings.length < 2} onClick={() => setMode("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {mode === "edit" && <EditEnvironmentDialog environment={environment} siblings={siblings} onClose={() => setMode(null)} />}
      {mode === "delete" && (
        <ManageDialog
          kind="environment"
          target={{ id: environment.id, name: environment.name, url: `/api/environments/${environment.id}` }}
          redirect={redirect}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}

/** One short line about what the project is. Line breaks are folded into spaces. */
function DescriptionInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  return (
    <Textarea
      id={id}
      rows={2}
      value={value}
      maxLength={MAX_DESCRIPTION + 40}
      placeholder="What it is, in a line or two"
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
    />
  );
}

const SERVER_SEES = "Visible to the server, like names. Never put secrets here.";

export function NewProjectDialog({
  open,
  onOpenChange,
  orgId,
  taken,
  suggestions = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  taken: ReadonlySet<string>;
  suggestions?: string[];
}) {
  const router = useRouter();
  const { keyPair } = useVault();
  const resolver = useMemo(() => zodResolver(newProjectSchema(taken)), [taken]);
  const blank: NewProjectValues = { name: "", description: "", tags: [], environment: "dev", kind: "dev" };
  const form = useForm<NewProjectValues>({ resolver, defaultValues: blank });
  const { isSubmitting, errors } = form.formState;
  // The type follows the environment name until the person picks one themselves.
  const [kindChosen, setKindChosen] = useState(false);

  async function onSubmit(values: NewProjectValues) {
    if (!keyPair) return form.setError("root.server", { message: "Unlock your vault first." });
    try {
      const environment = await sealNewEnvironment(keyPair.publicKey, values.environment, values.kind);
      const made = await post("/api/projects", {
        orgId,
        name: values.name,
        description: values.description,
        tags: values.tags,
        environment,
      });
      onOpenChange(false);
      form.reset(blank);
      setKindChosen(false);
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
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-description">Description (optional)</FieldLabel>
                  <DescriptionInput id="project-description" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : <FieldDescription>{SERVER_SEES}</FieldDescription>}
                </Field>
              )}
            />
            <Controller
              name="tags"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-tags">Tags (optional)</FieldLabel>
                  <TagInput id="project-tags" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} suggestions={suggestions} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Filter the project list by them.</FieldDescription>
                  )}
                </Field>
              )}
            />
            <div className="grid grid-cols-[1fr_9rem] gap-3">
              <Controller
                name="environment"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="project-first-env">First environment</FieldLabel>
                    <Input
                      {...field}
                      id="project-first-env"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!kindChosen) form.setValue("kind", inferKind(e.target.value));
                      }}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="kind"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-first-kind">Type</FieldLabel>
                    <KindSelect
                      id="project-first-kind"
                      value={field.value}
                      onChange={(k) => {
                        setKindChosen(true);
                        field.onChange(k);
                      }}
                    />
                  </Field>
                )}
              />
            </div>
            <FieldDescription>You can add more later. It gets its own key, sealed to you.</FieldDescription>
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
  const form = useForm<NewEnvironmentValues>({ resolver, defaultValues: { name: "", kind: "other" } });
  const { isSubmitting, errors } = form.formState;
  const [kindChosen, setKindChosen] = useState(false);

  async function onSubmit(values: NewEnvironmentValues) {
    if (!keyPair) return form.setError("root.server", { message: "Unlock your vault first." });
    try {
      const env = await sealNewEnvironment(keyPair.publicKey, values.name, values.kind);
      const made = await post(`/api/projects/${projectId}/environments`, env);
      onOpenChange(false);
      form.reset({ name: "", kind: "other" });
      setKindChosen(false);
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
                  <Input
                    {...field}
                    id="env-name"
                    placeholder="staging"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!kindChosen) form.setValue("kind", inferKind(e.target.value));
                    }}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="kind"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="env-kind">Type</FieldLabel>
                  <KindSelect
                    id="env-kind"
                    value={field.value}
                    onChange={(k) => {
                      setKindChosen(true);
                      field.onChange(k);
                    }}
                  />
                  <FieldDescription>Shown as a badge, so you can tell which one you are in.</FieldDescription>
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

/** Rename a project and edit its plaintext details. Keys and secrets are not touched. */
export function EditProjectDialog({
  project,
  siblings,
  suggestions = [],
  onClose,
}: {
  project: { id: string; name: string } & ProjectDetails;
  siblings: string[];
  suggestions?: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const taken = useMemo(() => new Set(siblings.map((n) => n.toLowerCase())), [siblings]);
  const resolver = useMemo(() => zodResolver(editProjectSchema(taken, project.name)), [taken, project.name]);
  const form = useForm<EditProjectValues>({
    resolver,
    defaultValues: {
      name: project.name,
      description: project.description ?? "",
      tags: project.tags,
      repoUrl: project.repoUrl ?? "",
      docsUrl: project.docsUrl ?? "",
    },
  });

  async function save(values: EditProjectValues) {
    // Only what changed, so a stale tab cannot overwrite a field it never touched.
    const d = form.formState.dirtyFields;
    const patch: Record<string, unknown> = {};
    if (d.name) patch.name = values.name;
    if (d.description) patch.description = values.description;
    if (d.tags) patch.tags = values.tags;
    if (d.repoUrl) patch.repoUrl = values.repoUrl;
    if (d.docsUrl) patch.docsUrl = values.docsUrl;
    if (Object.keys(patch).length === 0) return onClose();
    try {
      await call(`/api/projects/${project.id}`, "PATCH", patch);
      onClose();
      router.refresh();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(save)} noValidate className="grid gap-4" aria-label="Edit project">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Context for the people who open it. Keys and secrets stay as they are.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-project-name">Name</FieldLabel>
                  <Input {...field} id="edit-project-name" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-project-description">Description</FieldLabel>
                  <DescriptionInput id="edit-project-description" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : <FieldDescription>{SERVER_SEES}</FieldDescription>}
                </Field>
              )}
            />
            <Controller
              name="tags"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-project-tags">Tags</FieldLabel>
                  <TagInput id="edit-project-tags" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} suggestions={suggestions} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {(["repoUrl", "docsUrl"] as const).map((key) => (
              <Controller
                key={key}
                name={key}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`edit-project-${key}`}>{key === "repoUrl" ? "Repository link" : "Docs link"}</FieldLabel>
                    <Input
                      {...field}
                      id={`edit-project-${key}`}
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      placeholder={key === "repoUrl" ? "https://github.com/acme/billing" : "https://docs.example.com"}
                      aria-invalid={fieldState.invalid}
                    />
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
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditEnvironmentDialog({
  environment,
  siblings,
  onClose,
}: {
  environment: { id: string; name: string; kind: EnvKind };
  siblings: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const taken = useMemo(() => new Set(siblings.map((n) => n.toLowerCase())), [siblings]);
  const resolver = useMemo(() => zodResolver(editEnvironmentSchema(taken, environment.name)), [taken, environment.name]);
  const form = useForm<EditEnvironmentValues>({ resolver, defaultValues: { name: environment.name, kind: environment.kind } });

  async function save(values: EditEnvironmentValues) {
    const d = form.formState.dirtyFields;
    const patch: Record<string, unknown> = {};
    if (d.name) patch.name = values.name;
    if (d.kind) patch.kind = values.kind;
    if (Object.keys(patch).length === 0) return onClose();
    try {
      await call(`/api/environments/${environment.id}`, "PATCH", patch);
      onClose();
      router.refresh();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(save)} noValidate className="grid gap-4" aria-label="Edit environment">
          <DialogHeader>
            <DialogTitle>Edit environment</DialogTitle>
            <DialogDescription>Only the name and type change. Keys and secrets stay as they are.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-env-name">Name</FieldLabel>
                  <Input {...field} id="edit-env-name" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="kind"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="edit-env-kind">Type</FieldLabel>
                  <KindSelect id="edit-env-kind" value={field.value} onChange={field.onChange} />
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
              {form.formState.isSubmitting ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Target = { id: string; name: string; url: string };

/** Confirm deleting a project or environment. */
export function ManageDialog({
  kind,
  target,
  redirect,
  onClose,
}: {
  kind: "project" | "environment";
  target: Target | null;
  redirect?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!target) return null;

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
