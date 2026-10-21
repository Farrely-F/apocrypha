"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import FaultyTerminal from "@/components/FaultyTerminal";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";
import { CryptoError, unlockVault } from "@/lib/crypto";
import { IDLE_TIMEOUT_MS, TRUST_TTL_MS } from "@/lib/vault/keystore";
import { unlockSchema, type UnlockValues } from "@/lib/vault/schemas";
import { lock as lockStore } from "@/lib/vault/unlocked";
import { PassphraseInput } from "./passphrase-input";
import { RecoveryForm } from "./recovery-form";
import { useVault } from "./vault-provider";

/** The one message for every failed unlock. It must not say which part was wrong. */
const WRONG = "Incorrect passphrase or damaged vault.";

// "15-minute" (an adjective, so no plural).
const idleLabel =
  IDLE_TIMEOUT_MS >= 60_000
    ? `${Math.round(IDLE_TIMEOUT_MS / 60_000)}-minute`
    : `${Math.round(IDLE_TIMEOUT_MS / 1000)}-second`;
const trustDays = Math.round(TRUST_TTL_MS / 86_400_000);

type Me = { publicKey: string; passphraseBlob: string };
type Load = { kind: "loading" } | { kind: "ready"; me: Me } | { kind: "error" };

/**
 * The gate. FaultyTerminal is the backdrop (DESIGN.md section 14: effects on
 * landing and unlock only), kept dim and behind a solid pane so the form stays
 * readable. It pauses when hidden and holds still for reduced motion.
 */
export function UnlockScreen({ email }: { email: string }) {
  const router = useRouter();
  const { unlock } = useVault();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // Remounts the error so its flicker plays once per failed attempt.
  const [attempt, setAttempt] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const form = useForm<UnlockValues>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { passphrase: "", trust: false },
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    let live = true;
    fetch("/api/vault/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 401) return router.replace("/sign-in");
        if (res.status === 404) return router.replace("/vault/new");
        if (!res.ok) return setLoad({ kind: "error" });
        const me = (await res.json()) as Me;
        if (live) setLoad({ kind: "ready", me });
      })
      .catch(() => live && setLoad({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [router]);

  const ready = load.kind === "ready";
  // Focus once the form is usable.
  useEffect(() => {
    if (ready) form.setFocus("passphrase");
  }, [ready, form]);

  async function onSubmit(values: UnlockValues) {
    if (load.kind !== "ready") return;
    // Let "Unlocking" paint before Argon2id occupies the main thread.
    await new Promise((r) => setTimeout(r, 40));
    try {
      const keyPair = await unlockVault(load.me.passphraseBlob, values.passphrase);
      // The unlocked key must be the one the server holds the public half of.
      if (keyPair.publicKey !== load.me.publicKey) throw new CryptoError("decryption-failed", "mismatch");
      await unlock(keyPair, { trusted: values.trust });
      form.resetField("passphrase");
    } catch (err) {
      setAttempt((n) => n + 1);
      form.setValue("passphrase", "");
      form.setError("passphrase", {
        type: "server",
        message:
          err instanceof CryptoError
            ? WRONG
            : "This browser could not store the unlocked key. Check that site storage is not blocked, then try again.",
      });
      form.setFocus("passphrase");
    }
  }

  async function signOut() {
    await lockStore();
    await authClient.signOut();
    router.replace("/sign-in");
  }

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="absolute inset-0 z-0">
        <FaultyTerminal
          tint="#3ddc97"
          glyphs="characters"
          brightness={0.6}
          scanlineIntensity={0.35}
          curvature={0.1}
          glow={0.35}
          vignette={0.6}
          digitSize={3}
          timeScale={0.2}
          mouseReact={false}
          clickEffect="none"
          variation={undefined}
          dpr={undefined}
          style={undefined}
        />
      </div>

      {recovering && load.kind === "ready" ? (
        <RecoveryForm email={email} me={load.me} onBack={() => setRecovering(false)} onUnlocked={(kp) => unlock(kp, { trusted: false })} />
      ) : (
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="relative z-10 w-full max-w-md">
        <Pane title="Vault locked" meta={email} className="bg-background">
          <p className="text-bone-dim">
            Enter your vault passphrase. It opens a key that stays in this
            browser and never leaves it.
          </p>

          <FieldGroup className="mt-5">
            <Controller
              name="passphrase"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="unlock-passphrase">Vault passphrase</FieldLabel>
                  <PassphraseInput
                    {...field}
                    id="unlock-passphrase"
                    autoComplete="current-password"
                    disabled={!ready || isSubmitting}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <div key={attempt} className="mora-flicker">
                      <FieldError errors={[fieldState.error]} />
                    </div>
                  )}
                </Field>
              )}
            />

            <Controller
              name="trust"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                  <Checkbox
                    id="unlock-trust"
                    name={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="unlock-trust">Trust this device for {trustDays} days</FieldLabel>
                    <FieldDescription>
                      Turns off the {idleLabel} idle lock. Anyone using this browser can open the vault until it
                      expires or you lock it.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>

          {load.kind === "error" && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>Could not reach the server. Reload to try again.</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button type="submit" disabled={!ready || isSubmitting}>
              {isSubmitting ? "Unlocking, this takes a moment" : "Unlock"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
          <div className="mt-4">
            <Button type="button" variant="link" size="sm" className="px-0" disabled={!ready || isSubmitting} onClick={() => setRecovering(true)}>
              Forgot your passphrase? Use your recovery key
            </Button>
          </div>
        </Pane>
      </form>
      )}
    </div>
  );
}
