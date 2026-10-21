"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FaultyTerminal from "@/components/FaultyTerminal";
import { Pane } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { CryptoError, unlockVault } from "@/lib/crypto";
import { IDLE_TIMEOUT_MS, TRUST_TTL_MS } from "@/lib/vault/keystore";
import { lock as lockStore } from "@/lib/vault/unlocked";
import { useVault } from "./vault-provider";

const field =
  "w-full border border-hairline bg-pane px-3 py-2 text-bone placeholder:text-bone-faint focus:border-signal focus:outline-none";

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
  const [passphrase, setPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounts the error line so its flicker plays once per failed attempt.
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

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
  // Focus once the form is usable, and again after each failed attempt.
  useEffect(() => {
    if (ready && !busy) input.current?.focus();
  }, [ready, busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (load.kind !== "ready" || busy || !passphrase) return;
    setError(null);
    setBusy(true);
    // Let "Unlocking" paint before Argon2id occupies the main thread.
    await new Promise((r) => setTimeout(r, 40));
    try {
      const keyPair = await unlockVault(load.me.passphraseBlob, passphrase);
      // The unlocked key must be the one the server holds the public half of.
      if (keyPair.publicKey !== load.me.publicKey) throw new CryptoError("decryption-failed", "mismatch");
      await unlock(keyPair, { trusted: trust });
      setPassphrase("");
    } catch (err) {
      setPassphrase("");
      setAttempt((n) => n + 1);
      setError(
        err instanceof CryptoError
          ? WRONG
          : "This browser could not store the unlocked key. Check that site storage is not blocked, then try again.",
      );
      setBusy(false);
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

      <form onSubmit={submit} noValidate className="relative z-10 w-full max-w-md">
        <Pane title="Vault locked" meta={email} className="bg-background">
          <p className="text-bone-dim">
            Enter your vault passphrase. It opens a key that stays in this
            browser and never leaves it.
          </p>

          <div className="mt-5">
            <label htmlFor="unlock-passphrase" className="text-bone">
              Vault passphrase
            </label>
            <div className="mt-2 flex gap-2">
              <input
                ref={input}
                id="unlock-passphrase"
                name="passphrase"
                type={show ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="current-password"
                spellCheck={false}
                disabled={!ready || busy}
                aria-invalid={error === WRONG}
                aria-describedby="unlock-status"
                className={field}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShow((s) => !s)}
                aria-pressed={show}
                className="h-auto"
              >
                {show ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 text-bone-dim">
            <input
              type="checkbox"
              checked={trust}
              onChange={(e) => setTrust(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="shrink-0 whitespace-pre text-bone-faint after:content-['[_]'] peer-checked:text-signal peer-checked:after:content-['[x]'] peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal"
            />
            <span>
              <span className="text-bone">Trust this device for {trustDays} days</span>
              <span className="mt-1 block text-xs text-bone-faint">
                Turns off the {idleLabel} idle lock. Anyone using this browser
                can open the vault until it expires or you lock it.
              </span>
            </span>
          </label>

          <div id="unlock-status" className="mt-3 min-h-5">
            {error && (
              <p key={attempt} role="alert" className="mora-flicker text-blood-bright">
                {error}
              </p>
            )}
            {load.kind === "error" && !error && (
              <p role="alert" className="text-blood-bright">
                Could not reach the server. Reload to try again.
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button type="submit" disabled={!ready || busy || !passphrase}>
              {busy ? "Unlocking, this takes a moment" : "Unlock"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Pane>
      </form>
    </div>
  );
}
