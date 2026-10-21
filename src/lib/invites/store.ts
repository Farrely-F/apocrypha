import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";

type Db = LibSQLDatabase<typeof schema>;

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const BUILDERS: readonly OrgRole[] = ["owner", "admin"];

export type WrappedGrant = { envId: string; wrappedKey: string };

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export type CreateInviteResult =
  | { status: "created"; inviteId: string; expiresAt: Date }
  | { status: "forbidden" | "not-found" | "bad-environments" };

/**
 * An owner/admin invites someone to an org with read access to chosen
 * environments. Each environment must be in this org and the inviter must hold
 * its current key, otherwise they would be granting what they cannot decrypt.
 * Invited people join as `member`: reading is cryptographic, writing stays with owners and admins.
 */
export async function createInvite(
  db: Db,
  userId: string,
  input: { orgId: string; email: string | null; ephemeralPublicKey: string; grants: WrappedGrant[] },
  now = new Date(),
): Promise<CreateInviteResult> {
  const role = await roleIn(db, userId, input.orgId);
  if (!role) return { status: "not-found" };
  if (!BUILDERS.includes(role)) return { status: "forbidden" };

  const envIds = input.grants.map((g) => g.envId);
  if (envIds.length === 0 || new Set(envIds).size !== envIds.length) return { status: "bad-environments" };

  // Environments of this org that the inviter holds at the current key version.
  const held = await db
    .select({ envId: schema.environment.id, keyVersion: schema.environment.currentKeyVersion })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(
      schema.environmentKeyGrant,
      and(
        eq(schema.environmentKeyGrant.envId, schema.environment.id),
        eq(schema.environmentKeyGrant.principalType, "user"),
        eq(schema.environmentKeyGrant.principalId, userId),
        eq(schema.environmentKeyGrant.keyVersion, schema.environment.currentKeyVersion),
      ),
    )
    .where(and(eq(schema.project.organizationId, input.orgId), inArray(schema.environment.id, envIds)));
  if (held.length !== envIds.length) return { status: "bad-environments" };
  const versions = new Map(held.map((h) => [h.envId, h.keyVersion]));

  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.insert(schema.invite).values({
      id: inviteId,
      organizationId: input.orgId,
      createdBy: userId,
      role: "member",
      email: input.email?.toLowerCase() ?? null,
      ephemeralPublicKey: input.ephemeralPublicKey,
      expiresAt,
    });
    await tx.insert(schema.inviteGrant).values(
      input.grants.map((g) => ({ inviteId, envId: g.envId, keyVersion: versions.get(g.envId)!, wrappedKey: g.wrappedKey })),
    );
  });
  return { status: "created", inviteId, expiresAt };
}

export type PendingInvite = { id: string; email: string | null; expiresAt: Date; createdAt: Date };

/** Invites still open (not used, revoked or expired), for owners and admins. */
export async function listPendingInvites(db: Db, userId: string, orgId: string, now = new Date()): Promise<PendingInvite[] | null> {
  const role = await roleIn(db, userId, orgId);
  if (!role || !BUILDERS.includes(role)) return null;
  return db
    .select({ id: schema.invite.id, email: schema.invite.email, expiresAt: schema.invite.expiresAt, createdAt: schema.invite.createdAt })
    .from(schema.invite)
    .where(and(eq(schema.invite.organizationId, orgId), isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt), gt(schema.invite.expiresAt, now)));
}

export async function revokeInvite(db: Db, userId: string, inviteId: string, now = new Date()): Promise<"ok" | "forbidden" | "not-found"> {
  const [inv] = await db.select({ orgId: schema.invite.organizationId }).from(schema.invite).where(eq(schema.invite.id, inviteId)).limit(1);
  const role = inv ? await roleIn(db, userId, inv.orgId) : null;
  if (!inv || !role) return "not-found";
  if (!BUILDERS.includes(role)) return "forbidden";
  const done = await db
    .update(schema.invite)
    .set({ revokedAt: now })
    .where(and(eq(schema.invite.id, inviteId), isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt)))
    .returning({ id: schema.invite.id });
  return done.length ? "ok" : "not-found";
}

export type InviteOffer = {
  orgName: string;
  ephemeralPublicKey: string;
  grants: { envId: string; keyVersion: number; wrappedKey: string }[];
};

/** What a redeemer needs to unwrap: only for an invite that is still open and meant for them. */
export async function getInviteOffer(
  db: Db,
  user: { id: string; email: string; emailVerified: boolean },
  inviteId: string,
  now = new Date(),
): Promise<InviteOffer | null> {
  const [inv] = await db
    .select({
      orgId: schema.invite.organizationId,
      orgName: schema.organization.name,
      email: schema.invite.email,
      ephemeralPublicKey: schema.invite.ephemeralPublicKey,
    })
    .from(schema.invite)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invite.organizationId))
    .where(and(eq(schema.invite.id, inviteId), isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt), gt(schema.invite.expiresAt, now)))
    .limit(1);
  if (!inv || !emailAllowed(inv.email, user)) return null;
  const grants = await db
    .select({ envId: schema.inviteGrant.envId, keyVersion: schema.inviteGrant.keyVersion, wrappedKey: schema.inviteGrant.wrappedKey })
    .from(schema.inviteGrant)
    .where(eq(schema.inviteGrant.inviteId, inviteId));
  return { orgName: inv.orgName, ephemeralPublicKey: inv.ephemeralPublicKey, grants };
}

/** An email-bound invite needs a verified account with that exact (case-insensitive) address. */
const emailAllowed = (bound: string | null, user: { email: string; emailVerified: boolean }) =>
  bound === null || (user.emailVerified && user.email.toLowerCase() === bound);

export type RedeemResult = { status: "joined"; orgId: string } | { status: "not-found" | "already-member" | "bad-grants" };

/**
 * Join the org with exactly the invited environments, re-wrapped to the
 * redeemer's own key. The conditional update is what makes it single use: two
 * racing redeems cannot both flip `used_at`.
 */
export async function redeemInvite(
  db: Db,
  user: { id: string; email: string; emailVerified: boolean },
  inviteId: string,
  rewrapped: WrappedGrant[],
  now = new Date(),
): Promise<RedeemResult> {
  const offer = await getInviteOffer(db, user, inviteId, now);
  if (!offer) return { status: "not-found" };

  const wanted = new Set(offer.grants.map((g) => g.envId));
  const got = new Set(rewrapped.map((g) => g.envId));
  if (got.size !== rewrapped.length || got.size !== wanted.size || [...got].some((e) => !wanted.has(e))) return { status: "bad-grants" };

  const [inv] = await db.select({ orgId: schema.invite.organizationId, role: schema.invite.role }).from(schema.invite).where(eq(schema.invite.id, inviteId)).limit(1);
  if (await roleIn(db, user.id, inv.orgId)) return { status: "already-member" };

  const versions = new Map(offer.grants.map((g) => [g.envId, g.keyVersion]));
  try {
    return await db.transaction(async (tx) => {
      const burned = await tx
        .update(schema.invite)
        .set({ usedAt: now, usedBy: user.id })
        .where(and(eq(schema.invite.id, inviteId), isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt), gt(schema.invite.expiresAt, now)))
        .returning({ id: schema.invite.id });
      if (burned.length === 0) throw new Error("gone");
      await tx.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: inv.orgId, userId: user.id, role: inv.role });
      await tx.insert(schema.environmentKeyGrant).values(
        rewrapped.map((g) => ({ envId: g.envId, principalType: "user" as const, principalId: user.id, keyVersion: versions.get(g.envId)!, wrappedKey: g.wrappedKey })),
      );
      return { status: "joined" as const, orgId: inv.orgId };
    });
  } catch {
    // Lost the race, or the member row already existed: either way nothing was written.
    return { status: "not-found" };
  }
}

