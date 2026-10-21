"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postSecret } from "@/lib/secrets/client";
import { newSecretSchema, type NewSecretValues } from "@/lib/secrets/schemas";
import { sealNewSecret } from "@/lib/secrets/seal";
import { nowMs, type Item } from "./shared";

export function AddSecretForm({
  envId,
  keyVersion,
  keys,
  names,
  onAdded,
}: {
  envId: string;
  keyVersion: number;
  keys: ReadonlyMap<number, Uint8Array>;
  names: ReadonlySet<string>;
  onAdded: (item: Item) => void;
}) {
  const resolver = useMemo(() => zodResolver(newSecretSchema(names)), [names]);
  const form = useForm<NewSecretValues>({ resolver, defaultValues: { name: "", value: "" } });
  const { isSubmitting, errors } = form.formState;

  async function onSubmit(values: NewSecretValues) {
    const key = keys.get(keyVersion);
    if (!key) {
      form.setError("root.server", { message: "This environment's key is not available. Reload the page." });
      return;
    }
    try {
      const body = await sealNewSecret(key, envId, keyVersion, values.name, values.value);
      await postSecret(envId, body);
      onAdded({ ok: true, id: body.secretId, version: 1, name: values.name, value: values.value, createdAt: nowMs() });
      form.reset({ name: "", value: "" });
    } catch (err) {
      form.setError("root.server", { message: (err as Error).message });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Add a secret">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="secret-name">Name</FieldLabel>
              <Input {...field} id="secret-name" placeholder="DATABASE_URL" autoComplete="off" spellCheck={false} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="value"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="secret-value">Value</FieldLabel>
              <Textarea {...field} id="secret-value" rows={4} autoComplete="off" spellCheck={false} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      {errors.root?.server && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        <FieldDescription>Sealed in this browser before it is sent.</FieldDescription>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sealing" : "Seal secret"}
        </Button>
      </div>
    </form>
  );
}
