"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { Copy, Download } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pane } from "@/components/shell";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth/client";
import { totpCodeSchema, twoFactorErrorMessage, type TotpCodeValues } from "@/lib/auth/schemas";
import { ActionError } from "./reauth-alert";

type Failure = { code?: string; message?: string };
type Setup =
  | { step: "scan"; uri: string; secret: string; codes: string[] }
  | { step: "codes"; codes: string[]; fresh: boolean };

/** `otpauth://totp/...?secret=ABC` -> `ABC`, for people who type the key in instead of scanning. */
const secretOf = (uri: string) => new URL(uri).searchParams.get("secret") ?? "";
const groups = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;

/**
 * Two-step sign-in with an authenticator app. The switch is the whole story:
 * on starts a setup that only counts once a real code is typed, off asks first.
 * Backup codes are shown once, when they are made.
 */
export function TwoFactorPane({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const fail = (e: { code?: string; message?: string } | null | undefined) =>
    setFailure({ code: e?.code, message: e?.message });

  async function begin() {
    setFailure(null);
    setBusy(true);
    const res = await authClient.twoFactor.enable({});
    setBusy(false);
    if (res.error || !res.data || res.data.method !== "totp") return fail(res.error);
    setSetup({ step: "scan", uri: res.data.totpURI, secret: secretOf(res.data.totpURI), codes: res.data.backupCodes });
  }

  async function turnOff() {
    setFailure(null);
    setBusy(true);
    const res = await authClient.twoFactor.disable({});
    setBusy(false);
    setDisabling(false);
    if (res.error) return fail(res.error);
    router.refresh();
  }

  async function newCodes() {
    setFailure(null);
    setBusy(true);
    const res = await authClient.twoFactor.generateBackupCodes({});
    setBusy(false);
    setRegenerating(false);
    if (res.error || !res.data) return fail(res.error);
    setSetup({ step: "codes", codes: res.data.backupCodes, fresh: false });
  }

  return (
    <Pane title="Two-step sign-in" meta={enabled ? "on" : "off"} tone={enabled ? "signal" : "default"} className="bg-abyss/65 backdrop-blur-md">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-bone-dim">
            {enabled
              ? "Signing in with GitHub or Google also asks for a 6-digit code from your authenticator app."
              : "Ask for a 6-digit code from an authenticator app each time you sign in, so a stolen GitHub or Google session is not enough."}
          </p>
          <p className="mt-2 text-xs text-bone-faint">It protects signing in. Your vault passphrase is separate and is still what opens your secrets.</p>
        </div>
        <Switch
          aria-label="Two-step sign-in"
          checked={enabled}
          disabled={busy}
          onCheckedChange={(on) => (on ? void begin() : setDisabling(true))}
          className="mt-1"
        />
      </div>

      {failure && (
        <div className="mt-4">
          <ActionError {...failure} />
        </div>
      )}

      {enabled && (
        <div className="mt-5">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRegenerating(true)}>
            New backup codes
          </Button>
        </div>
      )}

      <SetupDialog
        setup={setup}
        onClose={() => {
          const wasSetup = setup?.step === "codes" && setup.fresh;
          setSetup(null);
          if (wasSetup) router.refresh();
        }}
        onVerified={(codes) => setSetup({ step: "codes", codes, fresh: true })}
      />

      <AlertDialog open={disabling} onOpenChange={setDisabling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off two-step sign-in?</AlertDialogTitle>
            <AlertDialogDescription>
              Signing in will no longer ask for a code, and your backup codes stop working. You can turn it on again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void turnOff()}>
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={regenerating} onOpenChange={setRegenerating}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make new backup codes?</AlertDialogTitle>
            <AlertDialogDescription>The ones you have now stop working the moment the new ones are made.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the old ones</AlertDialogCancel>
            <AlertDialogAction onClick={() => void newCodes()}>Make new codes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Pane>
  );
}

function SetupDialog({
  setup,
  onClose,
  onVerified,
}: {
  setup: Setup | null;
  onClose: () => void;
  onVerified: (codes: string[]) => void;
}) {
  const [saved, setSaved] = useState(false);
  const scanning = setup?.step === "scan";

  // Leaving mid-setup is fine: the secret only counts once a code has been typed.
  const close = (open: boolean) => {
    if (open) return;
    setSaved(false);
    onClose();
  };

  return (
    <Dialog open={setup !== null} onOpenChange={close}>
      <DialogContent className="sm:max-w-md" showCloseButton={!(setup?.step === "codes" && setup.fresh && !saved)}>
        {setup?.step === "scan" && <ScanStep setup={setup} onVerified={onVerified} onCancel={() => close(false)} />}
        {setup?.step === "codes" && (
          <>
            <DialogHeader>
              <DialogTitle>{setup.fresh ? "Save your backup codes" : "Your new backup codes"}</DialogTitle>
              <DialogDescription>
                Each works once if you lose your phone. Keep them somewhere safe and offline. They are not shown again.
              </DialogDescription>
            </DialogHeader>
            <Codes codes={setup.codes} />
            {setup.fresh ? (
              <Field orientation="horizontal">
                <Checkbox id="saved-codes" checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
                <FieldContent>
                  <FieldLabel htmlFor="saved-codes" className="font-normal">
                    I have saved these codes
                  </FieldLabel>
                </FieldContent>
              </Field>
            ) : null}
            <DialogFooter>
              <Button type="button" disabled={setup.fresh && !saved} onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
        {!setup && !scanning ? null : null}
      </DialogContent>
    </Dialog>
  );
}

function ScanStep({
  setup,
  onVerified,
  onCancel,
}: {
  setup: Extract<Setup, { step: "scan" }>;
  onVerified: (codes: string[]) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TotpCodeValues>({ resolver: zodResolver(totpCodeSchema), defaultValues: { code: "" } });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    setError(null);
    const res = await authClient.twoFactor.verifyTotp({ code });
    if (res.error) {
      setError(twoFactorErrorMessage(res.error.code));
      form.reset({ code: "" });
      // The field is disabled while submitting; focus it once it is live again.
      requestAnimationFrame(() => form.setFocus("code"));
      return;
    }
    onVerified(setup.codes);
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Set up an authenticator</DialogTitle>
        <DialogDescription>
          Scan this with an authenticator app (1Password, Authy, Google Authenticator), then enter the code it shows.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center">
        {/* Drawn here in the browser: the secret in this code never goes to a QR service. */}
        <div className="bg-bone p-3" data-testid="totp-qr">
          <QRCode value={setup.uri} size={168} bgColor="transparent" fgColor="#040b0b" />
        </div>
      </div>
      <p className="text-center text-xs text-bone-faint">
        Can&apos;t scan? Enter this key instead:
        <br />
        <code className="select-all text-bone-dim" data-testid="totp-secret">{groups(setup.secret)}</code>
      </p>
      <form onSubmit={submit} noValidate aria-label="Verify authenticator code">
        <Controller
          name="code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || error !== null} className="items-center">
              <FieldLabel htmlFor="setup-code" className="sr-only">
                6-digit code
              </FieldLabel>
              <InputOTP
                {...field}
                id="setup-code"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                disabled={isSubmitting}
                onChange={(v) => {
                  field.onChange(v);
                  if (v.length === 6) void submit();
                }}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} aria-invalid={fieldState.invalid || error !== null} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {error && (
          <Alert variant="destructive" className="mt-3" data-testid="setup-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="mt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Checking" : "Turn on"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function Codes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n") + "\n";
  return (
    <div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 border border-hairline-faint bg-abyss/50 px-4 py-3 font-mono text-sm text-bone" data-testid="backup-codes">
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          <Copy data-icon="inline-start" />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: "apocrypha-backup-codes.txt" });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download data-icon="inline-start" />
          Download
        </Button>
      </div>
    </div>
  );
}
