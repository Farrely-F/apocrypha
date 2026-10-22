"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import { Pane } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { describeDevice, formatWhen } from "@/lib/auth/device";
import { ActionError } from "./reauth-alert";

type Row = {
  id: string;
  token: string | null;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Every browser signed in as you. Revoking one signs it out at its next request. */
export function SessionsPane({ sessions }: { sessions: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current);

  async function run(key: string, fn: () => Promise<{ error: { message?: string } | null }>) {
    setError(null);
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error.message ?? "That didn't work. Try again.");
    else router.refresh();
  }

  return (
    <Pane
      title="Signed in on"
      meta={`${sessions.length} ${sessions.length === 1 ? "device" : "devices"}`}
      flush
      className="bg-abyss/65 backdrop-blur-md"
    >
      <ul className="divide-y divide-hairline-faint">
        {sessions.map((s) => {
          const device = describeDevice(s.userAgent);
          // A local connection reports an all-zero address; that is not worth showing.
          const ip = s.ipAddress && !/^[0:.]+$/.test(s.ipAddress) ? s.ipAddress : null;
          const Icon = /iPhone|iPad|Android/.test(device) ? Smartphone : Monitor;
          return (
            <li key={s.id} className="flex items-center gap-4 px-5 py-4">
              <Icon aria-hidden className="size-5 shrink-0 text-bone-faint" strokeWidth={1.5} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-bone">
                  {device}
                  {s.current && <Badge variant="outline">This device</Badge>}
                </p>
                <p className="truncate text-xs text-bone-faint">
                  Active {formatWhen(s.updatedAt)}
                  {ip ? ` · ${ip}` : ""}
                </p>
              </div>
              {s.token && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy !== null}
                  onClick={() => void run(s.id, () => authClient.revokeSession({ token: s.token! }))}
                >
                  {busy === s.id ? "Revoking" : "Revoke"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {(error || others.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline-faint px-5 py-3">
          {error && <ActionError message={error} />}
          {others.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={busy !== null}
              onClick={() => void run("others", () => authClient.revokeOtherSessions())}
            >
              {busy === "others" ? "Signing out" : "Sign out everywhere else"}
            </Button>
          )}
        </div>
      )}
    </Pane>
  );
}
