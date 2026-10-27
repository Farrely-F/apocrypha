type D = Record<string, unknown>;

const who = (name: string | null) => name ?? "someone";

/** One line a person can read. Events hold ids only, so the names come from the rows around them. */
export function describeEvent(e: { type: string; actorName: string | null; envName: string | null; targetName: string | null; data: string }): string {
  let d: D = {};
  try {
    d = JSON.parse(e.data) as D;
  } catch {
    /* an unreadable data field still shows the type */
  }
  const env = e.envName ? ` in ${e.envName}` : "";
  const target = who(e.targetName);
  switch (e.type) {
    case "org.created":
      return "created the organisation";
    case "org.renamed":
      return "renamed the organisation";
    case "member.erased":
      return "erased their account and left the organisation";
    case "project.created":
      return "created a project";
    case "project.renamed":
      return "renamed a project";
    case "project.updated":
      return "edited the details of a project";
    case "project.deleted":
      return "deleted a project";
    case "env.created":
      return `created the environment${e.envName ? ` ${e.envName}` : ""}`;
    case "env.renamed":
      return `renamed the environment${e.envName ? ` to ${e.envName}` : ""}`;
    case "env.updated":
      return `changed the type of ${e.envName ?? "an environment"}`;
    case "env.deleted":
      return "deleted an environment";
    case "env.read":
      return `opened ${e.envName ?? "an environment"} (sealed data fetched)`;
    case "env.rotated":
      return `rotated the key of ${e.envName ?? "an environment"}`;
    case "secret.created":
      return `added a secret${env}`;
    case "secret.updated":
      return `changed a secret${env}${d.version ? ` (v${String(d.version)})` : ""}`;
    case "secret.deleted":
      return `deleted a secret${env}`;
    case "member.joined":
      return "joined with an invite";
    case "member.removed":
      return `removed ${target}${typeof d.rotatedEnvironments === "number" ? `, rotating ${d.rotatedEnvironments} environment key${d.rotatedEnvironments === 1 ? "" : "s"}` : ""}`;
    case "member.role_changed":
      return `made ${target} ${String(d.role ?? "a different role")}`;
    case "member.access_changed":
      return `set ${target}'s access${e.envName ? ` to ${e.envName}` : ""} to ${String(d.to ?? "a new level")}${d.rotated ? " and rotated the key" : ""}`;
    case "member.regranted":
      return `restored ${target}'s access after a vault reset`;
    case "member.vault_reset":
      return "reset their vault (new keys)";
    case "invite.created":
      return `created an invite link${d.emailBound ? " for one email" : ""}`;
    case "invite.revoked":
      return "revoked an invite link";
    case "share.created":
      return `created a share link${env}${d.passwordProtected ? " with a password" : ""}`;
    case "share.revoked":
      return `revoked a share link${env}`;
    case "share.cleared":
      return `cleared ${typeof d.removed === "number" ? d.removed : "some"} finished share link${d.removed === 1 ? "" : "s"}${env}`;
    case "share.opened":
      return `a guest opened a share link${env}`;
    case "account.passphrase_changed":
      return "changed their vault passphrase";
    default:
      return e.type;
  }
}
