import type { OrgRole } from "../db/schema";
import { BUILDERS, WRITERS } from "./roles";

export type Grant = "yes" | "no" | "partial";
export type Permission = {
  id: string;
  group: "Secrets" | "Structure" | "People" | "Record";
  label: string;
  /** What the table cannot show in one cell. */
  detail?: string;
  grants: Record<OrgRole, Grant>;
};

const by = (allowed: readonly OrgRole[], fallback: Grant = "no"): Record<OrgRole, Grant> => ({
  owner: allowed.includes("owner") ? "yes" : fallback,
  admin: allowed.includes("admin") ? "yes" : fallback,
  member: allowed.includes("member") ? "yes" : fallback,
});

/**
 * What each role may do, drawn from the same lists the server checks (roles.ts) plus the few rules that
 * live next to the code they guard (members/store.ts, audit/store.ts). Read-only: there are three fixed
 * roles, and finer control is per environment (see Environment access).
 */
export const PERMISSIONS: readonly Permission[] = [
  {
    id: "secrets.read",
    group: "Secrets",
    label: "Read secrets",
    detail: "Only in environments whose key has been shared with them.",
    grants: { owner: "partial", admin: "partial", member: "partial" },
  },
  {
    id: "secrets.write",
    group: "Secrets",
    label: "Add, edit and delete secrets",
    detail: "Members need write access on each environment, granted by an owner or admin.",
    grants: { ...by(WRITERS), member: "partial" },
  },
  { id: "secrets.share", group: "Secrets", label: "Create share links", grants: by(BUILDERS) },
  { id: "structure.build", group: "Structure", label: "Create, rename and delete projects and environments", grants: by(BUILDERS) },
  { id: "structure.org", group: "Structure", label: "Rename or delete the organisation", grants: by(["owner"]) },
  { id: "people.invite", group: "People", label: "Invite people", grants: by(BUILDERS) },
  { id: "people.access", group: "People", label: "Choose each member's access per environment", grants: by(BUILDERS) },
  { id: "people.regrant", group: "People", label: "Re-share keys after a member resets their vault", grants: by(BUILDERS) },
  {
    id: "people.remove",
    group: "People",
    label: "Remove people",
    detail: "Owners remove admins and members, admins remove members. Nobody removes an owner.",
    grants: { owner: "yes", admin: "partial", member: "no" },
  },
  {
    id: "people.roles",
    group: "People",
    label: "Change roles and make owners",
    detail: "An owner's role is permanent: owners are never demoted or removed.",
    grants: by(["owner"]),
  },
  {
    id: "record.audit",
    group: "Record",
    label: "See the audit log",
    detail: "Members see events about themselves and the environments they can open.",
    grants: { owner: "yes", admin: "yes", member: "partial" },
  },
  { id: "record.verify", group: "Record", label: "Export and verify the audit chain", grants: by(["owner"]) },
];

export const ROLE_BLURB: Record<OrgRole, string> = {
  owner: "Runs the organisation. Can do everything, and can never be removed by anyone else.",
  admin: "Builds and invites. Manages access to environments and removes members, but cannot change roles.",
  member: "Works in the environments they are given: read, and write where allowed.",
};
