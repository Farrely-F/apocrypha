"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pane } from "@/components/shell";
import { useVault } from "@/components/vault";
import { Button } from "@/components/ui/button";
import { MAX_SECRET_VALUE_BYTES } from "@/lib/crypto";
import { fetchEnvironmentKeys, fetchSecrets, postSecret } from "@/lib/secrets/client";
import { openSecret, sealNewSecret, type OpenedSecret } from "@/lib/secrets/seal";

const field =
  "w-full border border-hairline bg-pane px-3 py-2 text-bone placeholder:text-bone-faint focus:border-signal focus:outline-none";

// Same shape as the variable names a .env file allows.
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REVEAL_FOR_MS = 30_000;
const MASK = "••••••••••••";

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; items: OpenedSecret[] };

export function SecretsPane({
  envId,
  keyVersion,
  canWrite,
}: {
  envId: string;
  /** The environment's current key version: what new secrets are sealed with. */
  keyVersion: number;
  canWrite: boolean;
}) {
  const { status, keyPair } = useVault();
  const keys = useRef<Map<number, Uint8Array>>(new Map());
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Open the environment key and the secrets whenever the vault is unlocked.
  // The key bytes live only in this ref and are wiped on lock or unmount.
  useEffect(() => {
    if (status !== "unlocked" || !keyPair) return;
    let cancelled = false;
    (async () => {
      try {
        const opened = await fetchEnvironmentKeys(envId, keyPair);
        if (cancelled) return;
        keys.current = opened;
        const rows = await fetchSecrets(envId);
        const items = await Promise.all(rows.map((r) => openSecret(opened, envId, r)));
        if (!cancelled) setLoaded({ state: "ready", items });
      } catch (e) {
        if (!cancelled) setLoaded({ state: "error", message: (e as Error).message });
      }
    })();
    const held = keys.current;
    return () => {
      cancelled = true;
      held.forEach((k) => k.fill(0));
      keys.current = new Map();
    };
  }, [status, keyPair, envId]);

  // Revealed values hide themselves again.
  useEffect(() => {
    if (revealed.size === 0) return;
    const t = setTimeout(() => setRevealed(new Set()), REVEAL_FOR_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  const toggle = useCallback((id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  async function copy(item: Extract<OpenedSecret, { ok: true }>) {
    try {
      await navigator.clipboard.writeText(item.value);
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    } catch {
      setFormError("Copy was blocked by the browser.");
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (loaded.state !== "ready" || busy) return;
    setFormError(null);
    const trimmed = name.trim();
    if (!NAME.test(trimmed)) {
      setFormError("Names use letters, digits and underscores, and can't start with a digit.");
      return;
    }
    if (loaded.items.some((i) => i.ok && i.name === trimmed)) {
      setFormError(`A secret named ${trimmed} already exists.`);
      return;
    }
    if (value.length === 0) {
      setFormError("Enter a value.");
      return;
    }
    if (new TextEncoder().encode(value).length > MAX_SECRET_VALUE_BYTES) {
      setFormError("Values can be at most 64 KB.");
      return;
    }
    const key = keys.current.get(keyVersion);
    if (!key) {
      setFormError("This environment's key is not available. Reload the page.");
      return;
    }
    setBusy(true);
    try {
      const body = await sealNewSecret(key, envId, keyVersion, trimmed, value);
      await postSecret(envId, body);
      setLoaded({
        state: "ready",
        items: [...loaded.items, { ok: true, id: body.secretId, version: 1, name: trimmed, value }],
      });
      setName("");
      setValue("");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = loaded.state === "ready" ? loaded.items : [];

  return (
    <Pane title="Secrets" meta={loaded.state === "ready" ? String(items.length) : "..."}>
      {loaded.state === "loading" && <p className="text-bone-faint">Opening this environment&apos;s key...</p>}
      {loaded.state === "error" && (
        <p role="alert" className="text-blood-bright">
          {loaded.message}
        </p>
      )}

      {loaded.state === "ready" && items.length === 0 && (
        <div>
          <p className="text-bone">No secrets yet</p>
          <p className="mt-1 max-w-[60ch] text-bone-dim">
            Anything you add here is encrypted in this browser with this
            environment&apos;s key before it leaves it.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-hairline-faint border-y border-hairline-faint">
          {items.map((item) =>
            item.ok ? (
              <li key={item.id} className="grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]">
                <span className="break-all text-bone">{item.name}</span>
                <span
                  data-testid={`value-${item.name}`}
                  className={`min-w-0 whitespace-pre-wrap break-all ${revealed.has(item.id) ? "text-signal" : "text-bone-faint"}`}
                >
                  {revealed.has(item.id) ? item.value : MASK}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => toggle(item.id)}
                    aria-pressed={revealed.has(item.id)}
                    aria-label={`${revealed.has(item.id) ? "Hide" : "Reveal"} ${item.name}`}
                  >
                    {revealed.has(item.id) ? "Hide" : "Reveal"}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => copy(item)} aria-label={`Copy ${item.name}`}>
                    {copied === item.id ? "Copied" : "Copy"}
                  </Button>
                </span>
              </li>
            ) : (
              <li key={item.id} className="py-3 text-blood-bright">
                A secret in this environment {item.reason}. It is still stored, untouched.
              </li>
            ),
          )}
        </ul>
      )}

      {loaded.state === "ready" && canWrite && (
        <form onSubmit={add} noValidate className="mt-6">
          <p className="text-bone">Add a secret</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <div>
              <label htmlFor="secret-name" className="text-xs text-bone-faint">
                Name
              </label>
              <input
                id="secret-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="DATABASE_URL"
                autoComplete="off"
                spellCheck={false}
                className={`${field} mt-1`}
              />
            </div>
            <div>
              <label htmlFor="secret-value" className="text-xs text-bone-faint">
                Value
              </label>
              <textarea
                id="secret-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={2}
                autoComplete="off"
                spellCheck={false}
                className={`${field} mt-1 resize-y`}
              />
            </div>
          </div>
          {formError && (
            <p role="alert" className="mt-3 text-blood-bright">
              {formError}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={busy || !name || !value}>
              {busy ? "Sealing" : "Seal secret"}
            </Button>
            <span className="text-xs text-bone-faint">Sealed in this browser before it is sent.</span>
          </div>
        </form>
      )}
    </Pane>
  );
}
