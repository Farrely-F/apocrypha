"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { KeyPair } from "@/lib/crypto";
import {
  clearSession,
  IDLE_TIMEOUT_MS,
  loadSession,
  onVaultEvent,
  touchSession,
} from "@/lib/vault/keystore";
import { adoptKeyPair, lock as lockStore, settled, unlockWith } from "@/lib/vault/unlocked";

export type VaultStatus = "loading" | "locked" | "unlocked";

interface VaultState {
  status: VaultStatus;
  keyPair: KeyPair | null;
  trusted: boolean;
}

interface VaultContextValue extends VaultState {
  /** Persist an unlocked key pair (non-extractable) and open the vault. Rejects if it cannot be stored. */
  unlock: (keyPair: KeyPair, opts?: { trusted?: boolean }) => Promise<void>;
  /** Delete the stored key and lock every tab. */
  lock: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}

const LOADING: VaultState = { status: "loading", keyPair: null, trusted: false };
const LOCKED: VaultState = { status: "locked", keyPair: null, trusted: false };

// How often the live session is re-checked against the clock, and the minimum
// gap between activity writes. Scales down for short test timeouts.
const CHECK_EVERY_MS = Math.max(250, Math.min(5000, Math.floor(IDLE_TIMEOUT_MS / 4)));
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * Holds the unlocked identity for the app routes. The key lives in IndexedDB
 * (non-extractable), so a refresh keeps the vault open until the idle window
 * (or, for a trusted device, the absolute expiry) passes. Locking in one tab
 * locks them all.
 *
 * `publicKey` is the signed-in account's vault public key: a stored key that
 * does not match it (another account used this browser) is discarded.
 */
export function VaultProvider({
  publicKey,
  children,
}: {
  publicKey: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<VaultState>(LOADING);

  const close = useCallback(() => {
    adoptKeyPair(null);
    setState(LOCKED);
  }, []);

  /** Read the keystore (which also wipes anything expired) and follow it. */
  const sync = useCallback(async () => {
    const s = await loadSession();
    if (s && s.keyPair.publicKey === publicKey) {
      adoptKeyPair(s.keyPair);
      setState((cur) =>
        cur.status === "unlocked" && cur.keyPair?.publicKey === s.keyPair.publicKey
          ? cur
          : { status: "unlocked", keyPair: s.keyPair, trusted: s.trusted },
      );
    } else {
      if (s) await clearSession(); // someone else's key: never keep it around
      close();
    }
  }, [publicKey, close]);

  // Restore after a reload, or right after creating the vault in this tab.
  useEffect(() => {
    void settled().then(sync);
  }, [sync]);

  // Another tab locked or unlocked.
  useEffect(
    () =>
      onVaultEvent((event) => {
        if (event === "lock") close();
        else void sync();
      }),
    [sync, close],
  );

  const unlocked = state.status === "unlocked";
  const trusted = state.trusted;

  // Idle lock, expiry and activity tracking. Only while unlocked.
  useEffect(() => {
    if (!unlocked) return;

    const lockIfGone = (alive: boolean) => {
      if (!alive) {
        close();
        void lockStore();
      }
    };

    // The idle clock starts when the vault is actually on screen, not when the
    // key was stored: a slow first render must not eat the idle window.
    if (!trusted) void touchSession().then(lockIfGone);

    // The keystore decides when time is up, so activity in any tab counts and
    // a session that expired while this tab slept is caught on the next tick.
    const tick = setInterval(() => {
      void loadSession().then((s) => lockIfGone(s !== null && s.keyPair.publicKey === publicKey));
    }, CHECK_EVERY_MS);

    let lastTouch = 0;
    const onActivity = () => {
      if (trusted) return; // idle lock is off; the absolute expiry is not extended
      const now = Date.now();
      if (now - lastTouch < CHECK_EVERY_MS) return;
      lastTouch = now;
      void touchSession().then(lockIfGone);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      lastTouch = Date.now();
      // touch checks expiry first, so coming back to a stale tab locks it.
      void touchSession().then(lockIfGone);
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      window.removeEventListener("scroll", onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [unlocked, trusted, publicKey, close]);

  const unlock = useCallback<VaultContextValue["unlock"]>(async (keyPair, opts = {}) => {
    try {
      await unlockWith(keyPair, opts);
    } catch (err) {
      adoptKeyPair(null);
      throw err;
    }
    setState({ status: "unlocked", keyPair, trusted: opts.trusted === true });
  }, []);

  const lock = useCallback(async () => {
    close();
    await lockStore();
  }, [close]);

  const value = useMemo(() => ({ ...state, unlock, lock }), [state, unlock, lock]);
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
