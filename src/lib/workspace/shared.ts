// Pure helpers shared by server and client code. Keep this file free of
// database and server-only imports: the create-vault form bundles it.

export type WorkspaceIds = { orgId: string; projectId: string; envId: string };

/** `/o/<org>/p/<project>/e/<env>`: the page for one environment. */
export const environmentPath = ({ orgId, projectId, envId }: WorkspaceIds) =>
  `/o/${orgId}/p/${projectId}/e/${envId}`;

/** Plaintext names given to the first workspace (DESIGN.md section 4). */
export const DEFAULT_WORKSPACE_NAMES = {
  orgName: "Personal",
  projectName: "First project",
  environmentName: "dev",
} as const;

/** The first environment key is always version 1. */
export const FIRST_KEY_VERSION = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);
