/**
 * The system administrator: the operator of this deployment, named in the environment, not in the database.
 * A table that grants admin access would itself be something to attack, and an env var makes removal immediate:
 * the list is read on every request.
 *
 * SYSTEM_ADMIN_EMAILS             comma-separated; unset or empty means the admin page does not exist (404)
 * SYSTEM_ADMIN_ENABLED            kill switch: false, 0, off or no turns the feature off even with emails set
 * SYSTEM_ADMIN_SESSION_MINUTES    how recent the sign-in must be (default 60)
 *
 * One role. The code asks for named permissions anyway, so a narrower role later is a few lines.
 */
export const SYSTEM_PERMISSIONS = [
  "overview.read",
  "users.read",
  "users.lookup",
  "users.reveal_email",
  "health.read",
  "health.run_chain_check",
  "access_log.read",
] as const;
export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number];

type Env = Record<string, string | undefined>;

/** Feature flag. On when admins are configured, unless SYSTEM_ADMIN_ENABLED says otherwise. */
export function adminEnabled(env: Env = process.env): boolean {
  return !/^(false|0|off|no)$/i.test((env.SYSTEM_ADMIN_ENABLED ?? "").trim()) && adminEmails(env).length > 0;
}

export function adminEmails(env: Env = process.env): string[] {
  if (/^(false|0|off|no)$/i.test((env.SYSTEM_ADMIN_ENABLED ?? "").trim())) return [];
  return (env.SYSTEM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e));
}

export function sessionWindowMs(env: Env = process.env): number {
  const n = Number(env.SYSTEM_ADMIN_SESSION_MINUTES);
  const minutes = Number.isFinite(n) && n >= 5 && n <= 1440 ? Math.floor(n) : 60;
  return minutes * 60_000;
}

/**
 * - `off`: no admin is configured. The page does not exist.
 * - `not-admin`, `unverified`: not an admin, or the provider has not verified the address. Both read as "not found".
 * - `stale`: it is an admin, but the sign-in is too old. Told to sign in again.
 */
export type AdminDecision = { status: "off" | "not-admin" | "unverified" | "stale" | "ok" };

export function decideAdmin(
  input: { email: string; emailVerified: boolean; sessionCreatedAt: Date | string | number; now?: number },
  env: Env = process.env,
): AdminDecision {
  const list = adminEmails(env);
  if (list.length === 0) return { status: "off" };
  if (!list.includes(input.email.trim().toLowerCase())) return { status: "not-admin" };
  if (!input.emailVerified) return { status: "unverified" };
  const created = new Date(input.sessionCreatedAt).getTime();
  const now = input.now ?? Date.now();
  if (!Number.isFinite(created) || now - created > sessionWindowMs(env) || now < created - 60_000) return { status: "stale" };
  return { status: "ok" };
}

/** Whether to show the "System" link: a signed-in person on the list. Says nothing about their session. */
export const isListedAdmin = (email: string, env: Env = process.env) => adminEmails(env).includes(email.trim().toLowerCase());

/** The one role and what it holds. A narrower role later is another entry here. */
export const ROLE_PERMISSIONS: Record<"admin", readonly SystemPermission[]> = { admin: SYSTEM_PERMISSIONS };

/** Whether a decision allows a named permission: only an `ok` administrator, and only what the role holds. */
export const can = (decision: AdminDecision, permission: SystemPermission): boolean => decision.status === "ok" && ROLE_PERMISSIONS.admin.includes(permission);

/** `a•••••@gmail.com`: the first character and the domain, with a fixed run of dots so the length of the name is not shown either. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••••${email.slice(at)}`;
}
