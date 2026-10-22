import type { OrgRole } from "../db/schema";

/**
 * Who may build and administer an organisation: create and delete projects and environments, invite
 * people, create share links, choose per-environment access and re-grant after a reset. Every store
 * checks this one list, and the permission table in Settings is drawn from it, so what the page says a
 * role can do is what the server enforces.
 */
export const BUILDERS: readonly OrgRole[] = ["owner", "admin"];

/** Roles that can always write secrets in an environment whose key they hold. A member needs a write flag. */
export const WRITERS: readonly OrgRole[] = BUILDERS;

export const isBuilder = (role: OrgRole) => BUILDERS.includes(role);
