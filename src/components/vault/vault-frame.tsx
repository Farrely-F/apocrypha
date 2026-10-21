"use client";

import { Lock } from "lucide-react";
import { ShellHeader, StatusBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { UnlockScreen } from "./unlock-screen";
import { useVault, VaultProvider } from "./vault-provider";

/**
 * The frame for every app route: header, status bar with the lock state and a
 * Lock control, and a main area that shows the unlock screen while locked.
 * Locked content is unmounted, not hidden, so a lock also drops whatever the
 * screens held in memory.
 */
function Frame({ email, children }: { email: string; children: React.ReactNode }) {
  const { status, trusted, lock } = useVault();
  const unlocked = status === "unlocked";

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ShellHeader />
      <div id="main" className="min-h-0 flex-1 overflow-y-auto">
        {unlocked ? (
          <div className="p-4 sm:p-6">{children}</div>
        ) : status === "locked" ? (
          <UnlockScreen email={email} />
        ) : null}
      </div>
      <StatusBar
        lock={unlocked ? "unlocked" : "locked"}
        trailing={
          unlocked ? (
            <div className="flex items-center gap-3">
              {trusted && <span className="text-bone-faint">trusted device</span>}
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void lock()}
                aria-label="Lock vault"
              >
                <Lock aria-hidden strokeWidth={1.5} />
                Lock
              </Button>
            </div>
          ) : null
        }
      />
    </div>
  );
}

export function VaultFrame({
  email,
  publicKey,
  children,
}: {
  email: string;
  publicKey: string;
  children: React.ReactNode;
}) {
  return (
    <VaultProvider publicKey={publicKey}>
      <Frame email={email}>{children}</Frame>
    </VaultProvider>
  );
}
