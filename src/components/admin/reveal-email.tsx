"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { twoFactorErrorMessage } from "@/lib/auth/schemas";

/**
 * The masked address, and a button that shows the full one. Showing it is a request the server logs first, and it
 * lasts until the page is left or reloaded: nothing is kept in the page's data.
 */
export function RevealEmail({ userId, masked }: { userId: string; masked: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/system/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { email?: string; error?: string; code?: string } | null;
    setBusy(false);
    if (!res.ok || !body?.email) return setError(body?.code ? twoFactorErrorMessage(body.code) : (body?.error ?? "Could not show it."));
    setEmail(body.email);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{email ?? masked}</span>
      {email ? (
        <Button type="button" size="xs" variant="ghost" onClick={() => setEmail(null)}>
          Hide
        </Button>
      ) : (
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void reveal()}>
          {busy ? "Showing" : "Show"}
        </Button>
      )}
      {error && <span role="alert" className="text-xs text-blood-bright">{error}</span>}
    </span>
  );
}
