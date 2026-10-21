"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pane } from "@/components/shell";
import { Button } from "@/components/ui/button";
import {
  createVault,
  generateEnvironmentKey,
  wrapEnvironmentKey,
  type CreatedVault,
} from "@/lib/crypto";
import { setUnlockedKeyPair } from "@/lib/vault/unlocked";
import { passphraseStrength, type StrengthLevel } from "@/lib/vault/strength";
import {
  DEFAULT_WORKSPACE_NAMES,
  FIRST_KEY_VERSION,
  environmentPath,
  type WorkspaceIds,
} from "@/lib/workspace/shared";

const field =
  "w-full border border-hairline bg-pane px-3 py-2 text-bone placeholder:text-bone-faint focus:border-signal focus:outline-none";

const levelFill: Record<StrengthLevel, number> = { short: 0, weak: 1, fair: 3, strong: 4 };
const levelColor: Record<StrengthLevel, string> = {
  short: "bg-blood",
  weak: "bg-blood",
  fair: "bg-signal-dim",
  strong: "bg-signal",
};

type Step = "passphrase" | "sealing" | "recovery" | "saving";

/** Letters and digits only, lower-cased, so dashes and spacing never matter. */
const squash = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

export function CreateVaultForm({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [vault, setVault] = useState<CreatedVault | null>(null);
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passphraseStrength(passphrase);
  const matches = passphrase.length > 0 && passphrase === confirm;
  const canSeal = strength.ok && matches && step === "passphrase";

  const tail = vault ? squash(vault.recoveryKey).slice(-4) : "";
  const confirmed = vault !== null && squash(typed) === tail;

  async function seal(e: React.FormEvent) {
    e.preventDefault();
    if (!canSeal) return;
    setError(null);
    setStep("sealing");
    // Let "Sealing" paint before Argon2id occupies the main thread.
    await new Promise((r) => setTimeout(r, 40));
    try {
      const created = await createVault(passphrase);
      setVault(created);
      // The passphrase is not needed again; drop it from component state.
      setPassphrase("");
      setConfirm("");
      setStep("recovery");
    } catch {
      setError("This browser could not create the keys. Try a current Chrome, Firefox or Safari.");
      setStep("passphrase");
    }
  }

  async function copyKey() {
    if (!vault) return;
    try {
      await navigator.clipboard.writeText(vault.recoveryKey);
      setCopied(true);
    } catch {
      setError("Copy was blocked. Select the key and copy it by hand.");
    }
  }

  function downloadKey() {
    if (!vault) return;
    const text = `Apocrypha recovery key for ${email}\n\n${vault.recoveryKey}\n\nKeep this somewhere safe and offline. Anyone with it and your account can open your vault.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "apocrypha-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function save() {
    if (!vault || !confirmed) return;
    setError(null);
    setStep("saving");
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
      const res = await fetch("/api/vault", {
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
        setError("This account already has a vault. Your new keys were not saved.");
        setStep("recovery");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The server could not save your vault. Try again.");
        setStep("recovery");
        return;
      }
      const ids = (await res.json().catch(() => null)) as Partial<WorkspaceIds> | null;
      setUnlockedKeyPair(vault.keyPair);
      // The vault is saved. Land in the new environment; /dashboard resolves
      // to the same place if the response was unreadable.
      router.replace(
        ids?.orgId && ids.projectId && ids.envId
          ? environmentPath({ orgId: ids.orgId, projectId: ids.projectId, envId: ids.envId })
          : "/dashboard",
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setStep("recovery");
    }
  }

  if (step === "recovery" || step === "saving") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-8 pt-6">
        <Pane title="Your recovery key" tone="danger" meta="shown once">
          <p className="text-bone-dim">
            This key opens your vault if you forget the passphrase. We never
            see it and can&apos;t show it again. Save it somewhere safe and
            offline, such as a password manager or a printed page.
          </p>
          <p
            data-testid="recovery-key"
            className="mt-4 break-all border border-hairline bg-pane px-3 py-3 text-lg text-signal select-all"
          >
            {vault?.recoveryKey}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyKey}>
              {copied ? "Copied" : "Copy key"}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadKey}>
              Download as .txt
            </Button>
          </div>

          <div className="mt-6">
            <label htmlFor="rk-confirm" className="text-bone">
              Type the last 4 characters of the key to confirm you saved it
            </label>
            <input
              id="rk-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              className={`${field} mt-2 max-w-48`}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-blood-bright">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button disabled={!confirmed || step === "saving"} onClick={save}>
              {step === "saving" ? "Saving vault" : "Create vault"}
            </Button>
            <span className="text-xs text-bone-faint">
              Nothing is saved to the server until you confirm.
            </span>
          </div>
        </Pane>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 pt-6">
      <form onSubmit={seal} noValidate>
        <Pane title="Create your vault" meta={email}>
          <p className="max-w-[60ch] text-bone-dim">
            Your passphrase locks a key that only this browser holds. We store
            the locked key and never the passphrase, so we can&apos;t reset it.
            You&apos;ll enter it on every new device.
          </p>

          <div className="mt-6">
            <label htmlFor="passphrase" className="text-bone">
              Vault passphrase
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="passphrase"
                type={show ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                className={field}
                aria-describedby="strength-hint"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShow((s) => !s)}
                aria-pressed={show}
              >
                {show ? "Hide" : "Show"}
              </Button>
            </div>

            <div className="mt-3 flex gap-1" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 ${
                    passphrase && i < levelFill[strength.level]
                      ? levelColor[strength.level]
                      : "bg-hairline-faint"
                  }`}
                />
              ))}
            </div>
            <p id="strength-hint" className="mt-2 text-xs text-bone-faint">
              {passphrase ? strength.hint : "At least 12 characters. Four random words works well."}
            </p>
          </div>

          <div className="mt-5">
            <label htmlFor="confirm" className="text-bone">
              Confirm passphrase
            </label>
            <input
              id="confirm"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              className={`${field} mt-2`}
            />
            {confirm && !matches && (
              <p className="mt-2 text-xs text-blood-bright">The passphrases don&apos;t match.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-blood-bright">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button type="submit" disabled={!canSeal && step !== "sealing"}>
              {step === "sealing" ? "Sealing, this takes a moment" : "Seal vault"}
            </Button>
          </div>
        </Pane>
      </form>
    </div>
  );
}
