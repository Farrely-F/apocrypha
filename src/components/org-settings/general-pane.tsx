"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScrollText } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuditSheet } from "@/components/workspace/audit-sheet";
import type { OrgRole } from "@/lib/db/schema";
import type { TreeOrg } from "@/lib/workspace/manage";
import { renameOrganizationSchema, type RenameOrganizationValues } from "@/lib/workspace/schemas";

/** The organisation's name, and the way to its audit log. Only an owner can rename. */
export function GeneralPane({ org, role }: { org: TreeOrg; role: OrgRole }) {
  const router = useRouter();
  const [audit, setAudit] = useState(false);
  const isOwner = role === "owner";
  const form = useForm<RenameOrganizationValues>({ resolver: zodResolver(renameOrganizationSchema), defaultValues: { name: org.name } });
  const { isSubmitting, isDirty, isSubmitSuccessful } = form.formState;

  async function onSubmit(values: RenameOrganizationValues) {
    const res = await fetch(`/api/organizations/${org.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: values.name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      form.setError("root.server", { message: body?.error ?? "Could not rename the organisation. Try again." });
      return;
    }
    form.reset({ name: values.name });
    router.refresh();
  }

  return (
    <Pane title="General" className="bg-abyss/65 backdrop-blur-md">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Organisation name">
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="org-name">Name</FieldLabel>
                <Input {...field} id="org-name" disabled={!isOwner} aria-invalid={fieldState.invalid} autoComplete="off" />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>{isOwner ? "Shown to everyone in the organisation. It is stored in the clear." : "Only an owner can rename it."}</FieldDescription>
                )}
              </Field>
            )}
          />
        </FieldGroup>
        {form.formState.errors.root?.server && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
          </Alert>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {isOwner && (
            <Button type="submit" size="sm" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? "Saving" : "Save name"}
            </Button>
          )}
          {isSubmitSuccessful && !isDirty && <span className="text-xs text-signal-dim">Saved</span>}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => setAudit(true)}>
            <ScrollText data-icon="inline-start" />
            Audit log
          </Button>
        </div>
      </form>
      <AuditSheet org={org} open={audit} onOpenChange={setAudit} />
    </Pane>
  );
}
