"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth/client";
import {
  backupCodeSchema,
  totpCodeSchema,
  twoFactorErrorMessage,
  type BackupCodeValues,
  type TotpCodeValues,
} from "@/lib/auth/schemas";

/**
 * The second check after GitHub, Google or email. No session exists until the
 * code is right, so nothing behind sign-in can be reached from here.
 */
export function TwoFactorScreen() {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<{ code?: string } | null>(null);
  const [done, setDone] = useState(false);

  async function verify(kind: "totp" | "backup", code: string) {
    setError(null);
    const call = kind === "totp" ? authClient.twoFactor.verifyTotp : authClient.twoFactor.verifyBackupCode;
    const res = await call({ code, trustDevice: remember });
    if (res.error) {
      setError({ code: res.error.code });
      return false;
    }
    setDone(true);
    router.replace("/dashboard");
    return true;
  }

  const expired = error?.code === "INVALID_TWO_FACTOR_COOKIE";

  return (
    <div className="w-full max-w-md">
      <Pane title={backup ? "Backup code" : "Authenticator code"} meta="one more check" className="mora-frame-corners bg-background">
        <p className="text-bone-dim">
          {backup
            ? "Enter one of the backup codes you saved when you turned on two-step sign-in. Each works once."
            : "Open your authenticator app and enter the 6-digit code for Apocrypha."}
        </p>

        {error && (
          <Alert variant="destructive" className="mt-5" data-testid="two-factor-error">
            <AlertDescription>{twoFactorErrorMessage(error.code)}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6">
          {backup ? (
            <BackupForm disabled={done} onSubmit={(code) => verify("backup", code)} />
          ) : (
            <TotpForm disabled={done} onSubmit={(code) => verify("totp", code)} />
          )}
        </div>

        <Field orientation="horizontal" className="mt-5">
          <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} disabled={done} />
          <FieldContent>
            <FieldLabel htmlFor="remember" className="font-normal">
              Don&apos;t ask for a code on this browser for 30 days
            </FieldLabel>
          </FieldContent>
        </Field>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-bone-faint">
          <Button
            type="button"
            variant="link"
            size="xs"
            className="px-0"
            onClick={() => {
              setBackup((b) => !b);
              setError(null);
            }}
          >
            {backup ? "Use my authenticator app" : "Use a backup code"}
          </Button>
          <Link href="/sign-in" className="text-bone-dim underline underline-offset-4 hover:text-signal">
            {expired ? "Sign in again" : "Start over"}
          </Link>
        </div>
      </Pane>
    </div>
  );
}

function TotpForm({ onSubmit, disabled }: { onSubmit: (code: string) => Promise<boolean>; disabled: boolean }) {
  const form = useForm<TotpCodeValues>({ resolver: zodResolver(totpCodeSchema), defaultValues: { code: "" } });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    const ok = await onSubmit(code);
    if (!ok) {
      form.reset({ code: "" });
      // The field is disabled while submitting; focus it once it is live again.
      requestAnimationFrame(() => form.setFocus("code"));
    }
  });

  return (
    <form onSubmit={submit} noValidate aria-label="Authenticator code">
      <Controller
        name="code"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="totp-code" className="sr-only">
              6-digit code
            </FieldLabel>
            <InputOTP
              {...field}
              id="totp-code"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              disabled={disabled || isSubmitting}
              aria-invalid={fieldState.invalid}
              // Typing the last digit submits: nothing else to do.
              onChange={(v) => {
                field.onChange(v);
                if (v.length === 6) void submit();
              }}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} aria-invalid={fieldState.invalid} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={disabled || isSubmitting}>
        {isSubmitting || disabled ? "Checking" : "Continue"}
      </Button>
    </form>
  );
}

function BackupForm({ onSubmit, disabled }: { onSubmit: (code: string) => Promise<boolean>; disabled: boolean }) {
  const form = useForm<BackupCodeValues>({ resolver: zodResolver(backupCodeSchema), defaultValues: { code: "" } });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    const ok = await onSubmit(code);
    if (!ok) {
      form.reset({ code: "" });
      // The field is disabled while submitting; focus it once it is live again.
      requestAnimationFrame(() => form.setFocus("code"));
    }
  });

  return (
    <form onSubmit={submit} noValidate aria-label="Backup code">
      <Controller
        name="code"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="backup-code" className="sr-only">
              Backup code
            </FieldLabel>
            <Input
              {...field}
              id="backup-code"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              disabled={disabled || isSubmitting}
              aria-invalid={fieldState.invalid}
              placeholder="xxxxx-xxxxx"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={disabled || isSubmitting}>
        {isSubmitting || disabled ? "Checking" : "Continue"}
      </Button>
    </form>
  );
}
