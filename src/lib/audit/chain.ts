import { createHash } from "node:crypto";

export const GENESIS = "0".repeat(64);

export type AuditFields = {
  organizationId: string;
  seq: number;
  createdAt: number;
  actorId: string | null;
  type: string;
  envId: string | null;
  targetUserId: string | null;
  data: string;
  prevHash: string;
};

/** The hash of one entry covers every field and the previous hash, so any edit shows up downstream. */
export function entryHash(e: AuditFields): string {
  const text = ["v1", e.organizationId, e.seq, e.createdAt, e.actorId ?? "", e.type, e.envId ?? "", e.targetUserId ?? "", e.data, e.prevHash].join("|");
  return createHash("sha256").update(text).digest("hex");
}

export type ChainEntry = AuditFields & { hash: string };
export type ChainCheck = { ok: true; count: number; head: string } | { ok: false; count: number; brokenAt: number; reason: string };

/**
 * Check a run of entries in order. `start` is where the run is expected to begin: the genesis for a
 * full log, or the last pruned entry (seq and hash) for a pruned one. A changed field, a deleted row, a
 * reordered row or a swapped hash all fail, and `brokenAt` is the first sequence number that does not fit.
 */
export function verifyChain(entries: readonly ChainEntry[], start: { seq: number; hash: string } = { seq: 0, hash: GENESIS }): ChainCheck {
  let prev = start;
  for (const e of entries) {
    if (e.seq !== prev.seq + 1) return { ok: false, count: entries.length, brokenAt: prev.seq + 1, reason: "a row is missing or out of order" };
    if (e.prevHash !== prev.hash) return { ok: false, count: entries.length, brokenAt: e.seq, reason: "does not follow the previous entry" };
    if (entryHash(e) !== e.hash) return { ok: false, count: entries.length, brokenAt: e.seq, reason: "contents were changed" };
    prev = { seq: e.seq, hash: e.hash };
  }
  return { ok: true, count: entries.length, head: prev.hash };
}
