"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postVersion } from "@/lib/secrets/client";
import { diffLines } from "@/lib/secrets/diff";
import { editSecretSchema, type EditSecretValues } from "@/lib/secrets/schemas";
import { openHistory, sealVersion } from "@/lib/secrets/seal";
import type { Item } from "./shared";

type Their = { version: number; name: string; value: string; deleted: boolean };

/**
 * Inline editor for one secret. Saving appends a version on top of the one you
 * opened. If someone saved first, nothing is overwritten: you see their version
 * and choose to keep it or write yours on top.
 */
export function SecretEditor({
  item,
  envId,
  keyVersion,
  keys,
  others,
  onSaved,
  onGone,
  onCancel,
}: {
  item: Item;
  envId: string;
  keyVersion: number;
  keys: ReadonlyMap<number, Uint8Array>;
  /** Other secrets' names, to refuse a rename onto one of them. */
  others: ReadonlySet<string>;
  onSaved: (next: Item) => void;
  onGone: () => void;
  onCancel: () => void;
}) {
  const resolver = useMemo(() => zodResolver(editSecretSchema(others, item)), [others, item]);
  const form = useForm<EditSecretValues>({ resolver, defaultValues: { name: item.name, value: item.value } });
  const { isSubmitting, errors } = form.formState;
  const [their, setTheir] = useState<Their | null>(null);
  const [base, setBase] = useState(item.version);

  async function write(values: EditSecretValues, onTopOf: number) {
    const key = keys.get(keyVersion);
    if (!key) {
      form.setError("root.server", { message: "This environment's key is not available. Reload the page." });
      return;
    }
    form.clearErrors("root.server");
    try {
      const body = await sealVersion(key, envId, item.id, onTopOf + 1, keyVersion, values.name, values.value);
      const res = await postVersion(envId, item.id, body);
      if (res.ok) {
        onSaved({ ...item, version: res.version, name: values.name, value: values.value });
        return;
      }
      if ("conflict" in res) {
        const [o] = await openHistory(keys, envId, item.id, [res.conflict]);
        if (!o.ok) {
          form.setError("root.server", { message: "Someone changed this secret and the new version could not be opened. Reload the page." });
        } else {
          setBase(o.version);
          setTheir({ version: o.version, name: o.name, value: o.value, deleted: o.deleted });
        }
        return;
      }
      form.setError("root.server", { message: res.error });
    } catch {
      form.setError("root.server", { message: "Could not reach the server. Check your connection and try again." });
    }
  }

  if (their) {
    const mine = form.getValues();
    const lines = diffLines(their.value, mine.value);
    return (
      <Alert variant="destructive" className="mt-3" data-testid="conflict">
        <AlertTitle>
          {their.deleted ? "This secret was deleted while you were editing it." : `This secret changed while you were editing it (now version ${their.version}).`}
        </AlertTitle>
        <AlertDescription>
          {their.deleted ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={onGone}>
              Remove from list
            </Button>
          ) : (
            <div className="mt-2 w-full">
              <p className="text-xs">Their value compared with yours (- is theirs, + is yours):</p>
              <pre className="mt-1 max-h-48 overflow-auto border border-hairline-faint bg-pane p-3 text-xs whitespace-pre-wrap break-all">
                {their.name !== mine.name && (
                  <span className="block text-bone-dim">
                    name: {their.name} / {mine.name}
                  </span>
                )}
                {lines.map((l, i) => (
                  <span key={i} className={`block ${l.kind === "add" ? "text-signal" : l.kind === "del" ? "text-blood-bright" : "text-bone-dim"}`}>
                    {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                    {l.text}
                  </span>
                ))}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => onSaved({ ...item, version: their.version, name: their.name, value: their.value })}>
                  Keep theirs
                </Button>
                <Button size="sm" disabled={isSubmitting} onClick={() => void write(mine, their.version)}>
                  {isSubmitting ? "Saving" : "Write mine on top"}
                </Button>
              </div>
              {errors.root?.server && <p role="alert" className="mt-2 text-xs">{errors.root.server.message}</p>}
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => write(v, base))} noValidate className="mt-3 border border-hairline p-4" aria-label={`Edit ${item.name}`}>
      <FieldGroup className="sm:grid sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`edit-name-${item.id}`}>Name</FieldLabel>
              <Input {...field} id={`edit-name-${item.id}`} autoComplete="off" spellCheck={false} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="value"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`edit-value-${item.id}`}>Value</FieldLabel>
              <Textarea {...field} id={`edit-value-${item.id}`} rows={3} autoComplete="off" spellCheck={false} aria-invalid={fieldState.invalid} />
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
      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Sealing" : "Save new version"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
