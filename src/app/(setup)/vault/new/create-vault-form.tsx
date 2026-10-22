"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PassphraseInput } from "@/components/vault/passphrase-input";
import {
  createVault,
  generateEnvironmentKey,
  wrapEnvironmentKey,
  type CreatedVault,
} from "@/lib/crypto";
import {
  createVaultSchema,
  recoveryConfirmSchema,
  type CreateVaultValues,
  type RecoveryConfirmValues,
} from "@/lib/vault/schemas";
import { flagNewVault } from "@/lib/tour/storage";
import { passphraseStrength, type StrengthLevel } from "@/lib/vault/strength";
import { lock as lockStore, setUnlockedKeyPair, settled as settledKeystore } from "@/lib/vault/unlocked";
import {
  DEFAULT_WORKSPACE_NAMES,
  FIRST_KEY_VERSION,
  environmentPath,
  type WorkspaceIds,
} from "@/lib/workspace/shared";

const meter: Record<StrengthLevel, { value: number; color: string }> = {
  short: { value: 0, color: "[&_[data-slot=progress-indicator]]:bg-blood" },
  weak: { value: 25, color: "[&_[data-slot=progress-indicator]]:bg-blood" },
  fair: { value: 75, color: "[&_[data-slot=progress-indicator]]:bg-signal-dim" },
  strong: { value: 100, color: "[&_[data-slot=progress-indicator]]:bg-signal" },
};

export type VaultMode = "create" | "reset";

export function CreateVaultForm({ email, mode = "create" }: { email: string; mode?: VaultMode }) {
  const [vault, setVault] = useState<CreatedVault | null>(null);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 pt-6">
      {vault ? (
        <RecoveryStep email={email} vault={vault} mode={mode} onDiscard={() => setVault(null)} />
      ) : (
        <PassphraseStep email={email} mode={mode} onSealed={setVault} />
      )}
    </div>
  );
}

function PassphraseStep({ email, mode, onSealed }: { email: string; mode: VaultMode; onSealed: (v: CreatedVault) => void }) {
  const form = useForm<CreateVaultValues>({
    resolver: zodResolver(createVaultSchema),
    defaultValues: { passphrase: "", confirm: "" },
    mode: "onChange",
  });
  const { isSubmitting, errors } = form.formState;
  const passphrase = useWatch({ control: form.control, name: "passphrase" });
  const strength = passphraseStrength(passphrase);

  async function onSubmit(values: CreateVaultValues) {
    // Let "Sealing" paint before Argon2id occupies the main thread.
    await new Promise((r) => setTimeout(r, 40));
    try {
      const created = await createVault(values.passphrase);
      // The passphrase is not needed again; drop it from form state.
      form.reset({ passphrase: "", confirm: "" });
      onSealed(created);
    } catch {
      form.setError("root.server", {
        message: "This browser could not create the keys. Try a current Chrome, Firefox or Safari.",
      });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Pane title={mode === "reset" ? "Set up your new vault" : "Create your vault"} meta={email}>
        <p className="max-w-[60ch] text-bone-dim">
          Your passphrase locks a key that only this browser holds. We store the locked key and never the passphrase,
          so we can&apos;t reset it. You&apos;ll enter it on every new device.
        </p>

        <FieldGroup className="mt-6">
          <Controller
            name="passphrase"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="passphrase">Vault passphrase</FieldLabel>
                <PassphraseInput
                  {...field}
                  id="passphrase"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  disabled={isSubmitting}
                />
                <Progress
                  aria-label="Passphrase strength"
                  value={passphrase ? meter[strength.level].value : 0}
                  className={meter[strength.level].color}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>
                    {passphrase ? strength.hint : "At least 12 characters. Four random words works well."}
                  </FieldDescription>
                )}
              </Field>
            )}
          />

          <Controller
            name="confirm"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="confirm">Confirm passphrase</FieldLabel>
                <PassphraseInput
                  {...field}
                  id="confirm"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  disabled={isSubmitting}
                />
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

        <div className="mt-6">
          <Button type="submit" disabled={isSubmitting || !passphrase}>
            {isSubmitting ? "Sealing, this takes a moment" : "Seal vault"}
          </Button>
        </div>
      </Pane>
    </form>
  );
}

function RecoveryStep({
  email,
  vault,
  mode,
  onDiscard,
}: {
  email: string;
  vault: CreatedVault;
  mode: VaultMode;
  onDiscard: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const schema = useMemo(() => recoveryConfirmSchema(vault.recoveryKey), [vault.recoveryKey]);
  const form = useForm<RecoveryConfirmValues>({
    resolver: zodResolver(schema),
    defaultValues: { typed: "" },
    mode: "onChange",
  });
  const { isSubmitting, isValid, errors } = form.formState;

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(vault.recoveryKey);
      setCopied(true);
    } catch {
      form.setError("root.server", { message: "Copy was blocked. Select the key and copy it by hand." });
    }
  }

  function downloadKey() {
    const text = `Apocrypha recovery key for ${email}\n\n${vault.recoveryKey}\n\nKeep this somewhere safe and offline. Anyone with it and your account can open your vault.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "apocrypha-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSubmit() {
    form.clearErrors("root.server");
    try {
      // The first environment's key is made here and only ever leaves this
      // browser wrapped to the user's own public key. The wrap binds the env id
      // and key version, so the id is chosen now rather than by the server.
      const envKey = generateEnvironmentKey();
      const envId = crypto.randomUUID();
      let wrappedKey: string;
      try {
        wrappedKey = await wrapEnvironmentKey(envKey, vault.keyPair.publicKey, {
          envId,
          keyVersion: FIRST_KEY_VERSION,
        });
      } finally {
        envKey.fill(0);
      }
      const res = await fetch(mode === "reset" ? "/api/vault/reset" : "/api/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicKey: vault.keyPair.publicKey,
          passphraseBlob: vault.passphraseBlob,
          recoveryBlob: vault.recoveryBlob,
          workspace: { envId, wrappedKey, ...DEFAULT_WORKSPACE_NAMES },
        }),
      });
      if (res.status === 409) {
        form.setError("root.server", { message: "This account already has a vault. Your new keys were not saved." });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        form.setError("root.server", { message: body?.error ?? "The server could not save your vault. Try again." });
        return;
      }
      const ids = (await res.json().catch(() => null)) as Partial<WorkspaceIds> | null;
      // A reset replaces the key pair: forget every stored copy of the old one (all tabs, trusted device)
      // before the new one is adopted.
      if (mode === "reset") await lockStore();
      setUnlockedKeyPair(vault.keyPair);
      // Next keeps this page mounted but hidden after navigating away, so drop
      // the recovery key and the typed confirmation from state and the DOM now.
      form.reset({ typed: "" });
      onDiscard();
      // A first vault gets the tour on the screen it lands on; a reset does not.
      if (mode === "create") {
        try {
          flagNewVault(window.sessionStorage);
        } catch {
          // Storage blocked: no tour, nothing else changes.
        }
      }
      // The vault is saved. Land in the new environment (/dashboard if the response was unreadable).
      // A full page load, not router.replace: Next keeps this page mounted but hidden, refetches
      // it once the vault exists, and follows its redirect to /dashboard, so the person never
      // reached the environment. The key must be in the keystore before the page unloads.
      await settledKeystore();
      window.location.replace(
        ids?.orgId && ids.projectId && ids.envId
          ? environmentPath({ orgId: ids.orgId, projectId: ids.projectId, envId: ids.envId })
          : "/dashboard",
      );
    } catch {
      form.setError("root.server", { message: "Could not reach the server. Check your connection and try again." });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Pane title="Your recovery key" tone="danger" meta="shown once">
        <p className="text-bone-dim">
          This key opens your vault if you forget the passphrase. We never see it and can&apos;t show it again. Save it
          somewhere safe and offline, such as a password manager or a printed page.
        </p>
        <p
          data-testid="recovery-key"
          className="mt-4 break-all border border-hairline bg-pane px-3 py-3 text-lg text-signal select-all"
        >
          {vault.recoveryKey}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copyKey}>
            {copied ? "Copied" : "Copy key"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={downloadKey}>
            Download as .txt
          </Button>
        </div>

        <FieldGroup className="mt-6">
          <Controller
            name="typed"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="rk-confirm">Type the last 4 characters of the key to confirm you saved it</FieldLabel>
                <Input
                  {...field}
                  id="rk-confirm"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={12}
                  className="max-w-48"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && field.value !== "" && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>

        {errors.root?.server && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{errors.root.server.message}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={!isValid || isSubmitting}>
            {isSubmitting ? "Saving vault" : mode === "reset" ? "Reset vault" : "Create vault"}
          </Button>
          <span className="text-xs text-bone-faint">Nothing is saved to the server until you confirm.</span>
        </div>
      </Pane>
    </form>
  );
}
