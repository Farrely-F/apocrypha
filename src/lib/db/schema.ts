import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Better Auth core tables (singular names, as the adapter expects).
// Timestamps are stored as integer milliseconds and mapped to Date.
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull();

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// One vault per user: the public key plus the private key wrapped two ways
// (passphrase, recovery key). The server never sees the passphrase, the
// recovery key or the unwrapped private key. See docs/DESIGN.md section 3.
export const vault = sqliteTable("vault", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  passphraseBlob: text("passphrase_blob").notNull(),
  recoveryBlob: text("recovery_blob").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Workspace tables (docs/DESIGN.md sections 4 and 6). Org, project and
// environment names are plaintext by design; secrets are not stored here.
//
// `organization` and `member` deliberately use the table and column names of
// Better Auth's organization plugin (organization: id, name, slug, logo,
// created_at, metadata; member: id, organization_id, user_id, role,
// created_at) so enabling the plugin later (#11) adopts them without a
// rewrite. The plugin is NOT enabled yet.

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: createdAt(),
  metadata: text("metadata"),
});

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Text, validated against ORG_ROLES in the app (the plugin allows custom roles later).
    role: text("role").$type<OrgRole>().notNull().default("member"),
    createdAt: createdAt(),
  },
  (table) => [
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
    uniqueIndex("member_organization_user_uidx").on(table.organizationId, table.userId),
  ],
);

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("project_organization_name_uidx").on(table.organizationId, table.name)],
);

export const environment = sqliteTable(
  "environment",
  {
    // Generated in the browser: the key wrap binds it (docs/crypto.md section 3).
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currentKeyVersion: integer("current_key_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("environment_project_name_uidx").on(table.projectId, table.name)],
);

export const PRINCIPAL_TYPES = ["user", "device", "machine"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

// One symmetric key per environment, wrapped to each principal allowed in it.
// `principal_id` is generic (a user id now; device or machine ids later), so it
// has no foreign key: whoever removes a principal removes its grants.
export const environmentKeyGrant = sqliteTable(
  "environment_key_grant",
  {
    envId: text("env_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    principalType: text("principal_type").$type<PrincipalType>().notNull(),
    principalId: text("principal_id").notNull(),
    keyVersion: integer("key_version").notNull(),
    wrappedKey: text("wrapped_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "environment_key_grant_pk",
      columns: [table.envId, table.principalType, table.principalId, table.keyVersion],
    }),
    index("environment_key_grant_principal_idx").on(table.principalType, table.principalId),
  ],
);

// A secret is a stable id in one environment; every edit is a new row in
// secret_version (append-only). Names, values and metadata are ciphertext,
// sealed in the browser with the environment key (docs/crypto.md section 4),
// so the server can store and return them but never read them.
export const secret = sqliteTable(
  "secret",
  {
    // Generated in the browser: the encryption context binds it.
    id: text("id").primaryKey(),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("secret_environment_idx").on(table.environmentId)],
);

export const secretVersion = sqliteTable(
  "secret_version",
  {
    secretId: text("secret_id")
      .notNull()
      .references(() => secret.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // Which environment key version sealed this row.
    keyVersion: integer("key_version").notNull(),
    name: text("name").notNull(),
    value: text("value").notNull(),
    metadata: text("metadata"),
    // A delete is a new version with this set; history keeps everything before it.
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ name: "secret_version_pk", columns: [table.secretId, table.version] })],
);

// An invite carries environment keys wrapped to a throwaway key pair made in the
// admin's browser. The throwaway private key lives only in the link's #fragment.
export const invite = sqliteTable(
  "invite",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    role: text("role").$type<OrgRole>().notNull().default("member"),
    // When set, only a verified account with this email may redeem.
    email: text("email"),
    // `v1|<alg>|<key>` of the throwaway pair; its algorithm fixes the wrapped-key format.
    ephemeralPublicKey: text("ephemeral_public_key").notNull(),
    // SHA-256 (hex) of a random secret that lives only in the link's #fragment. Knowing the
    // invite id is not enough to redeem: the redeemer must also present the secret.
    redeemHash: text("redeem_hash").notNull().default(""),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    usedBy: text("used_by"),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [index("invite_organization_id_idx").on(table.organizationId)],
);

export const inviteGrant = sqliteTable(
  "invite_grant",
  {
    inviteId: text("invite_id")
      .notNull()
      .references(() => invite.id, { onDelete: "cascade" }),
    envId: text("env_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    keyVersion: integer("key_version").notNull(),
    wrappedKey: text("wrapped_key").notNull(),
  },
  (table) => [primaryKey({ name: "invite_grant_pk", columns: [table.inviteId, table.envId, table.keyVersion] })],
);

// A temporary link to a snapshot of an environment's secrets for someone with no account.
// The server only ever holds the sealed envelope; the key lives in the link's #fragment.
export const share = sqliteTable(
  "share",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envId: text("env_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    envelope: text("envelope").notNull(),
    passwordProtected: integer("password_protected", { mode: "boolean" }).notNull(),
    itemCount: integer("item_count").notNull(),
    // At least one of these two limits is always set.
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    maxViews: integer("max_views"),
    views: integer("views").notNull().default(0),
    lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [index("share_organization_id_idx").on(table.organizationId), index("share_env_id_idx").on(table.envId)],
);

// After someone resets their vault to a new key pair, their old environment grants are useless.
// They are deleted and these rows record which environments an admin should re-share with them.
// Per environment, not per version: whatever versions the admin holds at that time are granted.
export const regrantRequest = sqliteTable(
  "regrant_request",
  {
    envId: text("env_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ name: "regrant_request_pk", columns: [table.envId, table.userId] })],
);
