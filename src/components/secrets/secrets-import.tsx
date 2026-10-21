"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postBatch, postVersion } from "@/lib/secrets/client";
import { parseDotenv } from "@/lib/secrets/dotenv";
import { dotenvImportSchema, type DotenvImportValues } from "@/lib/secrets/schemas";
import { sealNewSecret, sealVersion } from "@/lib/secrets/seal";
import type { Item } from "./shared";

/** Keep each request well under the server's body limit. */
const CHUNK_BYTES = 6_000_000;
const MAX_PER_REQUEST = 200;

/**
 * Paste or load a .env file, see what it would do, then import. New names are
 * created in all-or-nothing batches; names that already exist with a different
 * value are only touched if you tick the box, and each becomes a new version.
 * Rendered inside a Dialog by the pane.
 */
export function SecretsImport({
  envId,
  keyVersion,
  keys,
  existing,
  onDone,
}: {
  envId: string;
  keyVersion: number;
  keys: ReadonlyMap<number, Uint8Array>;
  existing: readonly Item[];
  onDone: (summary: string) => void;
}) {
  const form = useForm<DotenvImportValues>({
    resolver: zodResolver(dotenvImportSchema),
    defaultValues: { text: "", overwrite: false },
  });
  const { isSubmitting, errors } = form.formState;
  const text = useWatch({ control: form.control, name: "text" });
  const overwrite = useWatch({ control: form.control, name: "overwrite" });

  const plan = useMemo(() => {
    const parsed = parseDotenv(text);
    const byName = new Map(existing.map((i) => [i.name, i]));
    const created = parsed.entries.filter((e) => !byName.has(e.name));
    const changed = parsed.entries.filter((e) => byName.has(e.name) && byName.get(e.name)!.value !== e.value);
    return { parsed, byName, created, changed, same: parsed.entries.length - created.length - changed.length };
  }, [text, existing]);

  const todo = plan.created.length + (overwrite ? plan.changed.length : 0);

  async function load(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) {
      form.setError("text", { message: "That file is too large to import (5 MB limit)." });
      return;
    }
    form.setValue("text", await file.text(), { shouldValidate: true });
  }

  async function onSubmit(values: DotenvImportValues) {
    const key = keys.get(keyVersion);
    if (!key) {
      form.setError("root.server", { message: "This environment's key is not available. Reload the page." });
      return;
    }
    const chosen = [...plan.created, ...(values.overwrite ? plan.changed : [])];
    const tooBig = chosen.find((e) => new TextEncoder().encode(e.value).length > 65536);
    if (tooBig) {
      form.setError("text", { message: `${tooBig.name} is larger than 64 KB.` });
      return;
    }

    let made = 0;
    let updated = 0;
    let conflicts = 0;
    try {
      let chunk: Awaited<ReturnType<typeof sealNewSecret>>[] = [];
      let bytes = 0;
      const flush = async () => {
        if (chunk.length === 0) return;
        await postBatch(envId, chunk);
        made += chunk.length;
        chunk = [];
        bytes = 0;
      };
      for (const e of plan.created) {
        const body = await sealNewSecret(key, envId, keyVersion, e.name, e.value);
        chunk.push(body);
        bytes += body.name.length + body.value.length;
        if (bytes > CHUNK_BYTES || chunk.length >= MAX_PER_REQUEST) await flush();
      }
      await flush();

      if (values.overwrite) {
        for (const e of plan.changed) {
          const current = plan.byName.get(e.name)!;
          const body = await sealVersion(key, envId, current.id, current.version + 1, keyVersion, e.name, e.value);
          const res = await postVersion(envId, current.id, body);
          if (res.ok) updated++;
          else if ("conflict" in res) conflicts++;
          else throw new Error(res.error);
        }
      }
      const parts = [`${made} added`];
      if (values.overwrite) parts.push(`${updated} updated`);
      if (conflicts) parts.push(`${conflicts} skipped because they changed meanwhile`);
      onDone(`Imported: ${parts.join(", ")}.`);
    } catch (e) {
      form.setError("root.server", {
        message: `${(e as Error).message}${made ? ` ${made} secrets were added before this stopped.` : ""}`,
      });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate data-testid="import" aria-label="Import a .env file">
      <FieldGroup>
        <Controller
          name="text"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="import-text">.env contents</FieldLabel>
              <Textarea
                {...field}
                id="import-text"
                rows={7}
                placeholder={"DATABASE_URL=postgres://...\nSTRIPE_SECRET_KEY=sk_live_..."}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Read in this browser and sealed before anything is sent.</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Field>
          <FieldLabel htmlFor="import-file">Or load a file</FieldLabel>
          <Input id="import-file" type="file" accept=".env,text/plain,.txt" onChange={(e) => void load(e.target.files?.[0])} />
        </Field>

        {text.trim() !== "" && (
          <div className="text-bone-dim" data-testid="import-plan">
            <p>
              {plan.created.length} new, {plan.changed.length} with a different value, {plan.same} unchanged
              {plan.parsed.duplicates.length > 0 && `, ${plan.parsed.duplicates.length} repeated (the last one wins)`}.
            </p>
            {plan.parsed.errors.length > 0 && (
              <ul className="mt-2 text-blood-bright">
                {plan.parsed.errors.slice(0, 5).map((e) => (
                  <li key={e.line}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
                {plan.parsed.errors.length > 5 && <li>and {plan.parsed.errors.length - 5} more.</li>}
              </ul>
            )}
          </div>
        )}

        {plan.changed.length > 0 && (
          <Controller
            name="overwrite"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox id="import-overwrite" name={field.name} checked={field.value} onCheckedChange={field.onChange} />
                <FieldContent>
                  <FieldLabel htmlFor="import-overwrite">
                    Update the {plan.changed.length} existing {plan.changed.length === 1 ? "secret" : "secrets"} with a different value
                  </FieldLabel>
                  <FieldDescription>
                    {plan.changed.slice(0, 3).map((c) => c.name).join(", ")}
                    {plan.changed.length > 3 ? ", ..." : ""}. Each becomes a new version, so the old value stays in its history.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
        )}
      </FieldGroup>

      {errors.root?.server && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter className="mt-6">
        <Button type="submit" disabled={isSubmitting || todo === 0}>
          {isSubmitting ? "Sealing" : todo === 0 ? "Nothing to import" : `Import ${todo} ${todo === 1 ? "secret" : "secrets"}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
