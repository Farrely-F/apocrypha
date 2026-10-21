"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff } from "lucide-react";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PassphraseInput } from "@/components/vault/passphrase-input";
import { download } from "@/components/secrets/shared";
import { CryptoError } from "@/lib/crypto";
import { serializeDotenv } from "@/lib/secrets/dotenv";
import { openShare, parseEnvelope, type SharePayload } from "@/lib/share/crypto";

type Opened = { envelope: string; passwordProtected: boolean; views: number; maxViews: number | null; expiresAt: string | null };
type State =
  | { kind: "intro" }
  | { kind: "opening" }
  | { kind: "password"; opened: Opened }
  | { kind: "open"; opened: Opened; payload: SharePayload }
  | { kind: "unavailable"; message: string };

const MASK = "••••••••";
const storeKey = (id: string) => `apocrypha:share:${id}`;

/**
 * A guest opens a share link. Nothing is fetched until they click, because fetching spends one of the
 * link's views. The sealed content comes back once and is decrypted here, with the key from the URL
 * fragment (and the password, if the link has one). Wrong passwords are retried locally, not refetched.
 */
export function ShareScreen({ shareId }: { shareId: string }) {
  const [fragment, setFragment] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<State>({ kind: "intro" });
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let key: string | null = null;
    try {
      if (location.hash.length > 1) {
        sessionStorage.setItem(storeKey(shareId), location.hash.slice(1));
        history.replaceState(null, "", location.pathname);
      }
      key = sessionStorage.getItem(storeKey(shareId));
    } catch {
      key = location.hash.length > 1 ? location.hash.slice(1) : null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the fragment once on mount
    setFragment(key);
  }, [shareId]);

  async function decrypt(opened: Opened, pw: string | null) {
    if (!fragment) throw new CryptoError("decryption-failed", "no key");
    return openShare(shareId, opened.envelope, fragment, pw);
  }

  async function open() {
    setState({ kind: "opening" });
    try {
      const res = await fetch(`/api/shares/${shareId}/open`, { method: "POST", cache: "no-store" });
      const body = (await res.json().catch(() => null)) as (Opened & { error?: string }) | null;
      if (!res.ok || !body) return setState({ kind: "unavailable", message: body?.error ?? "This link is not available." });
      const protectedLink = parseEnvelope(body.envelope).passwordProtected;
      if (protectedLink) return setState({ kind: "password", opened: body });
      setState({ kind: "open", opened: body, payload: await decrypt(body, null) });
    } catch {
      setState({ kind: "unavailable", message: "This link could not be opened. The link may be incomplete, so ask for a new one." });
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "password") return;
    setBusy(true);
    setPwError(null);
    await new Promise((r) => setTimeout(r, 40));
    try {
      setState({ kind: "open", opened: state.opened, payload: await decrypt(state.opened, password) });
      setPassword("");
    } catch {
      setPwError("Wrong password, or the link is incomplete.");
    } finally {
      setBusy(false);
    }
  }

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => null);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };
  const dotenv = (p: SharePayload) => {
    try {
      return serializeDotenv(p.secrets);
    } catch {
      return p.secrets.map((s) => `${s.name}=${JSON.stringify(s.value)}`).join("\n") + "\n";
    }
  };

  return (
    <main className="mx-auto grid min-h-dvh max-w-3xl content-center gap-6 px-4 py-10">
      <h1 className="font-display text-3xl">Apocrypha</h1>

      {fragment === null && state.kind !== "unavailable" && (
        <Alert variant="destructive">
          <AlertDescription>This link is missing its key (the part after the # sign). Open the full link you were sent.</AlertDescription>
        </Alert>
      )}

      {state.kind === "intro" && (
        <Pane title="Shared with you">
          <p className="text-bone-dim">
            Someone shared secrets with you. They are encrypted end to end, so they open here in your browser. Opening the link uses one of its views, so open it
            when you are ready to copy what you need.
          </p>
          <div className="mt-5">
            <Button onClick={() => void open()} disabled={!fragment}>
              Open shared secrets
            </Button>
          </div>
        </Pane>
      )}

      {state.kind === "opening" && <p className="text-bone-faint">Opening...</p>}

      {state.kind === "unavailable" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.kind === "password" && (
        <Pane title="Password required">
          <form onSubmit={submitPassword} noValidate className="grid gap-4">
            <Field data-invalid={!!pwError}>
              <FieldLabel htmlFor="share-pw">Password</FieldLabel>
              <PassphraseInput id="share-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" autoFocus aria-invalid={!!pwError} />
              {pwError && <FieldError errors={[{ message: pwError }]} />}
            </Field>
            <div>
              <Button type="submit" disabled={busy || !password}>
                {busy ? "Opening, this takes a moment" : "Unlock"}
              </Button>
            </div>
          </form>
        </Pane>
      )}

      {state.kind === "open" && (
        <Pane title={state.payload.title || "Shared secrets"} meta={String(state.payload.secrets.length)}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy("all", dotenv(state.payload))}>
              {copied === "all" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied === "all" ? "Copied" : "Copy as .env"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => download(`${state.payload.title || "secrets"}.env`, dotenv(state.payload))}>
              <Download data-icon="inline-start" />
              Download .env
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.payload.secrets.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-mono">{s.name}</TableCell>
                  <TableCell className="max-w-64 truncate font-mono">{revealed.has(s.name) ? s.value : MASK}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={revealed.has(s.name) ? `Hide ${s.name}` : `Reveal ${s.name}`}
                        onClick={() => setRevealed((r) => { const n = new Set(r); if (n.has(s.name)) n.delete(s.name); else n.add(s.name); return n; })}
                      >
                        {revealed.has(s.name) ? <EyeOff /> : <Eye />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${s.name}`} onClick={() => void copy(s.name, s.value)}>
                        {copied === s.name ? <Check /> : <Copy />}
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-4 text-xs text-bone-faint">
            View {state.opened.views}
            {state.opened.maxViews !== null ? ` of ${state.opened.maxViews}` : ""}
            {state.opened.expiresAt ? `, valid until ${new Date(state.opened.expiresAt).toLocaleString()}` : ""}. Copy what you need now. This page does not keep it.
          </p>
        </Pane>
      )}
    </main>
  );
}
