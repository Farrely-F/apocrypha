import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";

type Db = LibSQLDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Reader = Db | Tx;

/**
 * What erasing an account does to each organisation the person belongs to.
 * - `delete`: they are the only member, so the organisation goes with them.
 * - `leave`: others remain and at least one other owner exists, so they just leave.
 * - `blocked`: they are the only owner and others remain. Nothing is erased until someone else is made an
 *   owner (or the organisation is deleted), so the rest of the team is never stranded.
 */
export type OrgFate = {
  orgId: string;
  name: string;
  role: OrgRole;
  members: number;
  environments: number;
  action: "delete" | "leave" | "blocked";
};

export type ErasePlan = { orgs: OrgFate[]; blocked: OrgFate[] };

export async function planErasure(db: Reader, userId: string): Promise<ErasePlan> {
  const mine = await db
    .select({ orgId: schema.member.organizationId, role: schema.member.role, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId));
  const orgs: OrgFate[] = [];
  for (const m of mine) {
    const people = await db.select({ userId: schema.member.userId, role: schema.member.role }).from(schema.member).where(eq(schema.member.organizationId, m.orgId));
    const others = people.filter((p) => p.userId !== userId);
    const [envs] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.environment)
      .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
      .where(eq(schema.project.organizationId, m.orgId));
    const action: OrgFate["action"] = others.length === 0 ? "delete" : m.role === "owner" && !others.some((p) => p.role === "owner") ? "blocked" : "leave";
    orgs.push({ orgId: m.orgId, name: m.name, role: m.role, members: people.length, environments: Number(envs?.n ?? 0), action });
  }
  orgs.sort((a, b) => a.name.localeCompare(b.name));
  return { orgs, blocked: orgs.filter((o) => o.action === "blocked") };
}

export type EraseResult =
  | { status: "erased"; deleted: string[]; left: string[] }
  | { status: "blocked"; blocked: OrgFate[] }
  | { status: "not-found" };

/** `%` and `_` are wildcards in LIKE; an email like a_b@x.com must match only itself. */
const likeAny = (column: typeof schema.verification.value, needle: string) =>
  sql`${column} like ${"%" + needle.replace(/[\\%_]/g, "\\$&") + "%"} escape '\\'`;

class Blocked extends Error {
  constructor(readonly blocked: OrgFate[]) {
    super("blocked");
  }
}

/**
 * Erase an account and what hangs off it, in one transaction: either all of it is gone or none of it is.
 *
 * Gone: the user, sessions, linked providers, two-factor secret, vault (public key and both wrapped private
 * keys), memberships, every environment key wrapped to them, their write flags and re-share requests, the
 * share links and unused invites they made, invites addressed to their email, their sign-in tokens, and
 * every organisation they were the only member of (with all of its contents).
 *
 * Kept, as opaque ids that no longer point at anyone: who created a secret version, who made or used an
 * invite, and the actor/target of audit events in organisations that continue. The audit log is a hash
 * chain, so a row cannot be edited without breaking it for everyone else. The email and name are not in any
 * of those rows.
 *
 * The plan is computed again inside the transaction, so a change of ownership between the preview and this
 * call cannot slip through.
 */
export async function eraseAccount(db: Db, userId: string): Promise<EraseResult> {
  try {
    return await db.transaction(async (tx) => {
      const [me] = await tx.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
      if (!me) return { status: "not-found" as const };
      const plan = await planErasure(tx, userId);
      if (plan.blocked.length) throw new Blocked(plan.blocked);

      const deleted = plan.orgs.filter((o) => o.action === "delete").map((o) => o.orgId);
      const left = plan.orgs.filter((o) => o.action === "leave").map((o) => o.orgId);

      // Organisations they were alone in: everything in them cascades.
      if (deleted.length) await tx.delete(schema.organization).where(inArray(schema.organization.id, deleted));

      // Environment keys wrapped to them. principal_id has no foreign key, so nothing cascades here.
      await tx.delete(schema.environmentKeyGrant).where(and(eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, userId)));
      // Share links and unused invites they made carry key material for the organisation: take them down.
      await tx.delete(schema.share).where(eq(schema.share.createdBy, userId));
      await tx.delete(schema.invite).where(and(eq(schema.invite.createdBy, userId), isNull(schema.invite.usedAt)));
      // Invites addressed to their email: drop the unused ones, blank the address on the rest.
      const emailMatch = sql`lower(${schema.invite.email}) = ${me.email.toLowerCase()}`;
      await tx.delete(schema.invite).where(and(emailMatch, isNull(schema.invite.usedAt)));
      await tx.update(schema.invite).set({ email: null }).where(emailMatch);

      // Their reads of environments are logged per session.
      const sessions = tx.select({ id: schema.session.id }).from(schema.session).where(eq(schema.session.userId, userId));
      await tx.delete(schema.auditEnvRead).where(inArray(schema.auditEnvRead.sessionId, sessions));

      // Sign-in leftovers: email links, trusted-browser and pending two-factor challenges (and their attempt
      // counters), and OAuth link requests that carry their id or email in the value.
      const owned = or(eq(schema.verification.value, userId), likeAny(schema.verification.value, userId), likeAny(schema.verification.value, me.email));
      const pending = await tx.select({ identifier: schema.verification.identifier }).from(schema.verification).where(owned);
      const identifiers = pending.flatMap((p) => [p.identifier, `2fa-attempts-${p.identifier}`]);
      await tx
        .delete(schema.verification)
        .where(or(owned, eq(schema.verification.identifier, me.email), eq(schema.verification.identifier, me.email.toLowerCase()), identifiers.length ? inArray(schema.verification.identifier, identifiers) : sql`0`));
      // Rate-limit counters keyed by their id.
      await tx.delete(schema.rateLimit).where(sql`${schema.rateLimit.key} like ${"%:" + userId.replace(/[\\%_]/g, "\\$&")} escape '\\'`);

      // Finally the account. Sessions, providers, two-factor, vault, memberships, writes and re-share requests cascade.
      await tx.delete(schema.user).where(eq(schema.user.id, userId));
      return { status: "erased" as const, deleted, left };
    });
  } catch (e) {
    if (e instanceof Blocked) return { status: "blocked", blocked: e.blocked };
    throw e;
  }
}
