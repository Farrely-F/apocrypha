"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { CryptoError } from "@/lib/crypto";
import { changeVaultPassphrase, fetchMe } from "@/lib/vault/passphrase-client";
import { changePassphraseSchema, type ChangePassphraseValues } from "@/lib/vault/schemas";
import { PassphraseInput } from "./passphrase-input";

const FIELDS = [
  { name: "current", label: "Current passphrase", auto: "current-password" },
  { name: "passphrase", label: "New passphrase", auto: "new-password" },
  { name: "confirm", label: "Confirm new passphrase", auto: "new-password" },
] as const;

/** Change the vault passphrase. The key pair stays the same, so nothing else needs re-sharing. */
export function ChangePassphraseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [done, setDone] = useState(false);
  const form = useForm<ChangePassphraseValues>({ resolver: zodResolver(changePassphraseSchema), defaultValues: { current: "", passphrase: "", confirm: "" } });

  async function onSubmit(values: ChangePassphraseValues) {
    await new Promise((r) => setTimeout(r, 40));
    try {
      await changeVaultPassphrase(await fetchMe(), values.current, values.passphrase);
      form.reset();
      setDone(true);
    } catch (e) {
      if (e instanceof CryptoError) form.setError("current", { message: "Incorrect passphrase." });
      else form.setError("root.server", { message: (e as Error).message });
    }
  }

  const close = (o: boolean) => {
    if (!o) {
      setDone(false);
      form.reset();
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change vault passphrase</DialogTitle>
          <DialogDescription>Your keys do not change, so nothing needs re-sharing. Other browsers keep working until they lock.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="grid gap-4">
            <Alert>
              <AlertDescription>Passphrase changed. Use the new one next time you unlock.</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Change passphrase" className="grid gap-4">
            <FieldGroup>
              {FIELDS.map((f, i) => (
                <Controller
                  key={f.name}
                  name={f.name}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`pw-${f.name}`}>{f.label}</FieldLabel>
                      <PassphraseInput {...field} id={`pw-${f.name}`} autoFocus={i === 0} autoComplete={f.auto} aria-invalid={fieldState.invalid} />
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
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Changing, this takes a moment" : "Change passphrase"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
