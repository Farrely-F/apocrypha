"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchHistory, postVersion } from "@/lib/secrets/client";
import { diffLines } from "@/lib/secrets/diff";
import { openHistory, sealVersion, type OpenedVersion } from "@/lib/secrets/seal";
import { ago, type Item } from "./shared";

type Ok = Extract<OpenedVersion, { ok: true }>;

/**
 * Every version of one secret, newest first, with who wrote it and what changed.
 * Values stay hidden until you ask, like everywhere else. Restoring an old
 * version writes it as a new version on top; nothing is rewritten. Rendered
 * inside a Sheet by the pane.
 */
export function SecretHistory({
  item,
  envId,
  keyVersion,
  keys,
  canWrite,
  currentUserId,
  onRestored,
}: {
  item: Item;
  envId: string;
  keyVersion: number;
  keys: ReadonlyMap<number, Uint8Array>;
  canWrite: boolean;
  currentUserId: string;
  onRestored: (next: Item) => void;
}) {
  const [versions, setVersions] = useState<OpenedVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [showValues, setShowValues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchHistory(envId, item.id);
        const opened = await openHistory(keys, envId, item.id, rows);
        if (!cancelled) setVersions(opened);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, item.id, keys, reload]);

  const oks = useMemo(() => (versions ?? []).filter((v): v is Ok => v.ok), [versions]);
  const latest = versions?.[versions.length - 1];
  const selected = oks.find((v) => v.version === (picked ?? latest?.version)) ?? null;
  const before = selected ? [...oks].reverse().find((v) => v.version < selected.version) ?? null : null;

  async function restore(v: Ok) {
    const key = keys.get(keyVersion);
    if (!key || !latest) return;
    setBusy(true);
    setError(null);
    try {
      const body = await sealVersion(key, envId, item.id, latest.version + 1, keyVersion, v.name, v.value);
      const res = await postVersion(envId, item.id, body);
      if (res.ok) {
        onRestored({ ...item, version: res.version, name: v.name, value: v.value });
        setPicked(null);
        setReload((n) => n + 1);
      } else if ("conflict" in res) {
        setError("This secret changed while you were looking. The history has been refreshed.");
        setReload((n) => n + 1);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const who = (v: Ok) => (v.createdBy === currentUserId ? "you" : v.createdByName);

  return (
    <div data-testid="history" className="flex flex-col gap-4 px-4 pb-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!versions && !error && <p className="text-bone-faint">Opening the history...</p>}

      {versions && (
        <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
          <ol className="flex flex-col gap-1">
            {[...versions].reverse().map((v) =>
              v.ok ? (
                <li key={v.version}>
                  <Button
                    variant={selected?.version === v.version ? "secondary" : "outline"}
                    size="sm"
                    className="h-auto w-full flex-col items-start gap-0 py-1.5 text-left"
                    onClick={() => setPicked(v.version)}
                    aria-current={selected?.version === v.version}
                  >
                    <span className="text-bone">
                      Version {v.version}
                      {v.deleted ? " (deleted)" : ""}
                      {v.version === latest?.version ? " (current)" : ""}
                    </span>
                    <span className="text-xs text-bone-faint">
                      {who(v)}, {ago(v.createdAt)}
                    </span>
                  </Button>
                </li>
              ) : (
                <li key={v.version}>
                  <Alert variant="destructive">
                    <AlertDescription>
                      Version {v.version} {v.reason}
                    </AlertDescription>
                  </Alert>
                </li>
              ),
            )}
          </ol>

          {selected && (
            <div className="min-w-0">
              <p className="text-xs text-bone-faint">
                {before ? `Version ${selected.version} compared with version ${before.version}` : `Version ${selected.version} is the first`}
              </p>
              {before && before.name !== selected.name && (
                <p className="mt-1 text-bone-dim">
                  Renamed {before.name} to {selected.name}
                </p>
              )}
              {!showValues ? (
                <p className="mt-2 text-bone-dim">
                  {before
                    ? before.value === selected.value
                      ? "The value did not change."
                      : `The value changed (${before.value.split("\n").length} to ${selected.value.split("\n").length} lines).`
                    : "The value is hidden."}
                </p>
              ) : (
                <pre className="mt-2 max-h-72 overflow-auto border border-hairline-faint bg-pane p-3 text-xs whitespace-pre-wrap break-all" data-testid="diff">
                  {diffLines(before?.value ?? "", selected.value).map((l, i) => (
                    <span key={i} className={`block ${l.kind === "add" ? "text-signal" : l.kind === "del" ? "text-blood-bright" : "text-bone-dim"}`}>
                      {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                      {l.text}
                    </span>
                  ))}
                </pre>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch id="history-values" checked={showValues} onCheckedChange={setShowValues} />
                  <Label htmlFor="history-values">Show values</Label>
                </div>
                {canWrite && selected.version !== latest?.version && !selected.deleted && (
                  <Button size="sm" disabled={busy} onClick={() => void restore(selected)}>
                    {busy ? "Restoring" : "Restore this version"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
