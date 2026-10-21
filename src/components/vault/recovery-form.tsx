"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CryptoError, type KeyPair } from "@/lib/crypto";
import { recoverWithKey, type Me } from "@/lib/vault/passphrase-client";
import { recoveryUnlockSchema, type RecoveryUnlockValues } from "@/lib/vault/schemas";
import { PassphraseInput } from "./passphrase-input";

/** Forgot the passphrase: the recovery key opens the vault and sets a new passphrase. */
export function RecoveryForm({ email, me, onBack, onUnlocked }: { email: string; me: Me; onBack: () => void; onUnlocked: (k: KeyPair) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RecoveryUnlockValues>({
    resolver: zodResolver(recoveryUnlockSchema),
    defaultValues: { recoveryKey: "", passphrase: "", confirm: "" },
  });

  async function onSubmit(values: RecoveryUnlockValues) {
    setError(null);
    await new Promise((r) => setTimeout(r, 40));
    try {
      const keyPair = await recoverWithKey(me, values.recoveryKey, values.passphrase);
      await onUnlocked(keyPair);
    } catch (e) {
      setError(e instanceof CryptoError ? "That recovery key is wrong or the vault is damaged." : (e as Error).message);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="relative z-10 w-full max-w-md">
      <Pane title="Recover vault" meta={email} className="bg-background">
        <p className="text-bone-dim">Your recovery key opens the vault once, and you set a new passphrase. The key itself stays valid.</p>
        <FieldGroup className="mt-5">
          <Controller
            name="recoveryKey"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="recovery-key">Recovery key</FieldLabel>
                <Input {...field} id="recovery-key" autoComplete="off" spellCheck={false} className="font-mono" aria-invalid={fieldState.invalid} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="passphrase"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="recovery-new">New vault passphrase</FieldLabel>
                <PassphraseInput {...field} id="recovery-new" autoComplete="new-password" aria-invalid={fieldState.invalid} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="confirm"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="recovery-confirm">Confirm new passphrase</FieldLabel>
                <PassphraseInput {...field} id="recovery-confirm" autoComplete="new-password" aria-invalid={fieldState.invalid} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Recovering, this takes a moment" : "Recover and unlock"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={form.formState.isSubmitting}>
            Back
          </Button>
        </div>
        <FieldDescription className="mt-4">Lost the recovery key too? Resetting is possible but only recovers what teammates can re-share.</FieldDescription>
      </Pane>
    </form>
  );
}
