import { checkWrappedKey, parseName, UUID, type Alg } from "../vault/payload";
import { isEnvKind, parseProjectDetails, PROJECT_DETAIL_KEYS, type EnvKind, type ProjectDetails } from "./meta";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export type NewEnvironmentBody = { id: string; name: string; wrappedKey: string; kind?: EnvKind };
export type NewProjectBody = {
  orgId: string;
  name: string;
  environment: NewEnvironmentBody;
  details: Partial<ProjectDetails>;
};

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): string | null {
  const extra = Object.keys(o).find((k) => !allowed.includes(k));
  return extra ? `Unexpected field: ${extra}.` : null;
}

/** An environment as sent by the browser: an id it chose (the key wrap binds it), a name, the wrapped key. */
export function parseNewEnvironment(input: unknown, alg: Alg, label = "environment"): Parsed<NewEnvironmentBody> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail(`${label} must be an object.`);
  const o = input as Record<string, unknown>;
  const extra = onlyKeys(o, ["id", "name", "wrappedKey", "kind"]);
  if (extra) return fail(extra);
  if (o.kind !== undefined && !isEnvKind(o.kind)) return fail(`${label}.kind must be dev, staging, prod or other.`);
  if (typeof o.id !== "string" || !UUID.test(o.id)) return fail(`${label}.id must be a UUID.`);
  const name = parseName(o.name, `${label}.name`);
  if (!name.ok) return name;
  const bad = checkWrappedKey(o.wrappedKey, alg);
  if (bad) return fail(`${label}.${bad}`);
  return {
    ok: true,
    value: {
      id: o.id.toLowerCase(),
      name: name.value,
      wrappedKey: o.wrappedKey as string,
      ...(o.kind !== undefined && { kind: o.kind as EnvKind }),
    },
  };
}

export function parseNewProject(input: unknown, alg: Alg): Parsed<NewProjectBody> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Request body must be a JSON object.");
  const o = input as Record<string, unknown>;
  const extra = onlyKeys(o, ["orgId", "name", "environment", ...PROJECT_DETAIL_KEYS]);
  if (extra) return fail(extra);
  if (typeof o.orgId !== "string" || !UUID.test(o.orgId)) return fail("orgId must be a UUID.");
  const name = parseName(o.name, "name");
  if (!name.ok) return name;
  const environment = parseNewEnvironment(o.environment, alg);
  if (!environment.ok) return environment;
  const details = parseProjectDetails(o);
  if (!details.ok) return details;
  return {
    ok: true,
    value: { orgId: o.orgId.toLowerCase(), name: name.value, environment: environment.value, details: details.value },
  };
}

export type NewOrganizationBody = { name: string; projectName: string; environment: NewEnvironmentBody };

export function parseNewOrganization(input: unknown, alg: Alg): Parsed<NewOrganizationBody> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Request body must be a JSON object.");
  const o = input as Record<string, unknown>;
  const extra = onlyKeys(o, ["name", "projectName", "environment"]);
  if (extra) return fail(extra);
  const name = parseName(o.name, "name");
  if (!name.ok) return name;
  const projectName = parseName(o.projectName, "projectName");
  if (!projectName.ok) return projectName;
  const environment = parseNewEnvironment(o.environment, alg);
  if (!environment.ok) return environment;
  return { ok: true, value: { name: name.value, projectName: projectName.value, environment: environment.value } };
}
