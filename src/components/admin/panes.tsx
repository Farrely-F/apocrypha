import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SignInAgain } from "./sign-in-again";

/** Shown instead of any data when the administrator's sign-in is older than the allowed window. */
export function StaleSession({ minutes }: { minutes: number }) {
  return (
    <div className="mx-auto w-full max-w-xl pt-10">
      <h1 className="font-display text-5xl leading-none text-bone">System</h1>
      <p className="mt-4 text-bone-dim">
        This page asks for a sign-in from the last {minutes === 60 ? "hour" : `${minutes} minutes`}, because it shows other people&apos;s account details. Nothing is shown until you sign in again.
      </p>
      <div className="mt-6">
        <SignInAgain />
      </div>
    </div>
  );
}

/** Not a gate: a plain note that the administrator's own account has no second factor. */
export function TwoFactorNote({ twoFactor }: { twoFactor: boolean }) {
  if (twoFactor) return null;
  return (
    <Alert className="mb-6" data-testid="two-factor-note">
      <AlertTriangle aria-hidden />
      <AlertDescription>
        Two-step sign-in is off on your account. This page shows other people&apos;s account details, so it is worth turning on in{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Settings
        </Link>
        . Nothing is blocked.
      </AlertDescription>
    </Alert>
  );
}

export const SYSTEM_PANE = "bg-abyss/65 backdrop-blur-md";

export const pct = (n: number, of: number) => (of === 0 ? "0%" : `${Math.round((n / of) * 100)}%`);

export function bytes(n: number | null): string {
  if (n === null) return "not available";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function Ledger({ rows }: { rows: { label: string; value: React.ReactNode; note?: string }[] }) {
  return (
    <ul className="divide-y divide-hairline-faint text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
          <span className="text-bone-dim">
            {r.label}
            {r.note && <span className="block text-xs text-bone-faint">{r.note}</span>}
          </span>
          <span className="shrink-0 text-bone tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
