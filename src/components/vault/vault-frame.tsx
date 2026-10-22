"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { AppGround, ShellHeader, StatusBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/workspace/command-palette";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import type { TreeOrg } from "@/lib/workspace/manage";
import { SignOutButton } from "./sign-out-button";
import { UnlockScreen } from "./unlock-screen";
import { useVault, VaultProvider } from "./vault-provider";

type Info = { org?: string | null; env?: string | null; keyVersion?: number | string | null };
const InfoContext = createContext<((info: Info) => void) | null>(null);

/**
 * Lets a page tell the status bar which org, environment and key version it is
 * showing. Renders nothing; clears itself when the page unmounts.
 */
export function StatusInfo({ org, env, keyVersion }: Info) {
  const set = useContext(InfoContext);
  useEffect(() => {
    set?.({ org, env, keyVersion });
    return () => set?.({});
  }, [set, org, env, keyVersion]);
  return null;
}

/**
 * The frame for every app route: header, status bar with the lock state and a
 * Lock control, and a main area that shows the unlock screen while locked.
 * Locked content is unmounted, not hidden, so a lock also drops whatever the
 * screens held in memory.
 */
function Frame({ email, tree, children }: { email: string; tree: TreeOrg[]; children: React.ReactNode }) {
  const { status, trusted, lock } = useVault();
  const unlocked = status === "unlocked";
  const [info, setInfo] = useState<Info>({});

  // Locked, the whole page is the gate, the same one as sign-in: no app chrome behind it.
  if (status === "locked") return <UnlockScreen email={email} />;
  if (!unlocked) return <div className="h-dvh bg-background" />;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ShellHeader
        nav={unlocked ? <WorkspaceNav tree={tree} /> : undefined}
        actions={
          <>
            <CommandPalette tree={tree} />
            <span className="hidden text-xs text-bone-faint sm:inline">{email}</span>
            <SignOutButton />
          </>
        }
      />
      <div className="relative min-h-0 flex-1">
        <AppGround />
        <div id="main" className="absolute inset-0 overflow-y-auto">
          <InfoContext.Provider value={setInfo}>
            <div className="p-4 sm:p-6">{children}</div>
          </InfoContext.Provider>
        </div>
      </div>
      <StatusBar
        org={unlocked ? info.org : null}
        env={unlocked ? info.env : null}
        keyVersion={unlocked ? info.keyVersion : null}
        lock={unlocked ? "unlocked" : "locked"}
        trailing={
          unlocked ? (
            <div className="flex items-center gap-3">
              {trusted && <span className="text-bone-faint">trusted device</span>}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="-mr-2 hover:text-signal"
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
  tree,
  children,
}: {
  email: string;
  publicKey: string;
  tree: TreeOrg[];
  children: React.ReactNode;
}) {
  return (
    <VaultProvider publicKey={publicKey}>
      <Frame email={email} tree={tree}>{children}</Frame>
    </VaultProvider>
  );
}
