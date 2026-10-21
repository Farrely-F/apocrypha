import type { ReactNode } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type LockState = "locked" | "unlocked";

type StatusBarProps = {
  /** Active organisation name. Placeholder until the session is wired. */
  org?: string | null;
  /** Active environment (dev / staging / prod ...). */
  env?: string | null;
  lock?: LockState;
  /** Current org key version. */
  keyVersion?: number | string | null;
  /** Right-aligned slot (hints, sync state). */
  trailing?: ReactNode;
  className?: string;
};

const EMPTY = "——"; // ——

function Segment({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-r border-hairline-faint px-3",
        className,
      )}
    >
      <span className="text-bone-faint">{label}</span>
      {children}
    </div>
  );
}

function Value({ value }: { value: ReactNode | null | undefined }) {
  const empty = value == null || value === "";
  return (
    <span className={empty ? "text-bone-faint" : "text-bone"}>
      {empty ? EMPTY : value}
    </span>
  );
}

/**
 * Bottom status bar: org, env, lock state, key version.
 * Skeleton: values are placeholders until auth/vault state is wired in.
 * Lock state changes fire a single flicker (see .mora-flicker); reduced
 * motion users get a static swap.
 */
export function StatusBar({
  org,
  env,
  lock = "locked",
  keyVersion,
  trailing,
  className,
}: StatusBarProps) {
  const unlocked = lock === "unlocked";
  const Icon = unlocked ? LockOpen : Lock;
  return (
    <footer
      aria-label="Vault status"
      className={cn(
        "flex h-8 items-stretch overflow-x-auto border-t border-hairline bg-background text-xs whitespace-nowrap",
        className,
      )}
    >
      <Segment label="org">
        <Value value={org} />
      </Segment>
      <Segment label="env">
        <Value value={env} />
      </Segment>
      <Segment label="vault">
        <span
          key={lock}
          role="status"
          className={cn(
            "mora-flicker inline-flex items-center gap-1.5 uppercase tracking-[0.12em]",
            unlocked ? "text-signal" : "text-bone-dim",
          )}
        >
          <Icon aria-hidden className="size-3" strokeWidth={1.5} />
          {lock}
        </span>
      </Segment>
      <Segment label="key">
        <Value
          value={keyVersion == null ? null : `v${String(keyVersion)}`}
        />
      </Segment>
      <div className="ml-auto flex shrink-0 items-center px-3 text-bone-faint">
        {trailing}
      </div>
    </footer>
  );
}
