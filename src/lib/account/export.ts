import { desc, eq, or } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";

type Db = LibSQLDatabase<typeof schema>;

const iso = (d: Date | number | null | undefined) => (d == null ? null : new Date(d).toISOString());

/**
 * A copy of the personal data held about one account, as a person can read it: who they are, how they sign
 * in, where they are signed in, what they belong to, and what the audit log records about them.
 *
 * Deliberately not here: other people's details (emails of fellow members), key material (the vault's
 * wrapped private keys, two-factor secret, session tokens, provider tokens), and secrets themselves. Secrets
 * are ciphertext on the server; each environment can be exported in readable form from its own page.
 */
export async function buildAccountExport(db: Db, userId: string, now = new Date()) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!u) return null;
  const [v] = await db.select().from(schema.vault).where(eq(schema.vault.userId, userId)).limit(1);
  const providers = await db.select({ providerId: schema.account.providerId, linkedAt: schema.account.createdAt }).from(schema.account).where(eq(schema.account.userId, userId));
  const sessions = await db
    .select({ userAgent: schema.session.userAgent, ipAddress: schema.session.ipAddress, createdAt: schema.session.createdAt, updatedAt: schema.session.updatedAt, expiresAt: schema.session.expiresAt })
    .from(schema.session)
    .where(eq(schema.session.userId, userId));
  const memberships = await db
    .select({ organisation: schema.organization.name, role: schema.member.role, joinedAt: schema.member.createdAt })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId));
  const events = await db
    .select({ organisationId: schema.auditEvent.organizationId, at: schema.auditEvent.createdAt, type: schema.auditEvent.type, environmentId: schema.auditEvent.envId, asActor: schema.auditEvent.actorId, data: schema.auditEvent.data })
    .from(schema.auditEvent)
    .where(or(eq(schema.auditEvent.actorId, userId), eq(schema.auditEvent.targetUserId, userId)))
    .orderBy(desc(schema.auditEvent.createdAt));

  return {
    exportedAt: now.toISOString(),
    about:
      "The personal data Apocrypha holds about this account. It leaves out other people's details, key material and secrets (those are ciphertext here; export an environment from its page to read it).",
    profile: { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, image: u.image, createdAt: iso(u.createdAt), updatedAt: iso(u.updatedAt) },
    signIn: {
      providers: providers.map((p) => ({ provider: p.providerId, linkedAt: iso(p.linkedAt) })),
      twoFactorEnabled: u.twoFactorEnabled,
    },
    vault: v ? { publicKey: v.publicKey, createdAt: iso(v.createdAt), updatedAt: iso(v.updatedAt) } : null,
    sessions: sessions.map((s) => ({ userAgent: s.userAgent, ipAddress: s.ipAddress, startedAt: iso(s.createdAt), lastActiveAt: iso(s.updatedAt), expiresAt: iso(s.expiresAt) })),
    memberships: memberships.map((m) => ({ organisation: m.organisation, role: m.role, joinedAt: iso(m.joinedAt) })),
    auditEvents: events.map((e) => ({ organisationId: e.organisationId, at: iso(e.at), type: e.type, environmentId: e.environmentId, wasActor: e.asActor === userId, data: safeJson(e.data) })),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
