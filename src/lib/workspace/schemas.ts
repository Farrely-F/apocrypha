import { z } from "@/lib/zod";
import { ENV_KINDS, MAX_DESCRIPTION, MAX_TAGS, parseDescription, parseTags, parseUrl } from "./meta";

const kind = z.enum(ENV_KINDS);

const description = z
  .string()
  .max(MAX_DESCRIPTION, `Use at most ${MAX_DESCRIPTION} characters.`)
  .refine((v) => parseDescription(v).ok, "Use one line of printable text.");

const tags = z
  .array(z.string())
  .max(MAX_TAGS, `Use at most ${MAX_TAGS} tags.`)
  .refine((v) => parseTags(v).ok, "A tag is lowercase letters, digits or hyphens.");

/** Empty is fine; otherwise a full https link with no username or password. */
const link = (what: string) =>
  z.string().refine((v) => {
    const r = parseUrl(v, what);
    return r.ok;
  }, "Use a full https:// link, without a username or password.");

/** Plaintext names: short, printable, no control characters. */
const name = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Give the ${what} a name.`)
    .max(64, "Use at most 64 characters.")
    .refine((v) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v), "Use only printable characters.");

/** New project: its name, details, and the first environment it starts with. */
export const newProjectSchema = (taken: ReadonlySet<string>) =>
  z
    .object({ name: name("project"), description, tags, environment: name("environment"), kind })
    .superRefine((v, ctx) => {
      if (taken.has(v.name.toLowerCase())) {
        ctx.addIssue({ code: "custom", path: ["name"], message: `A project named ${v.name} already exists.` });
      }
    });
export type NewProjectValues = z.infer<ReturnType<typeof newProjectSchema>>;

/** Edit a project: the name and its plaintext details. */
export const editProjectSchema = (taken: ReadonlySet<string>, current: string) =>
  z
    .object({ name: name("project"), description, tags, repoUrl: link("repoUrl"), docsUrl: link("docsUrl") })
    .superRefine((v, ctx) => {
      const n = v.name.toLowerCase();
      if (n !== current.toLowerCase() && taken.has(n)) {
        ctx.addIssue({ code: "custom", path: ["name"], message: `${v.name} is already taken here.` });
      }
    });
export type EditProjectValues = z.infer<ReturnType<typeof editProjectSchema>>;

export const editEnvironmentSchema = (taken: ReadonlySet<string>, current: string) =>
  z.object({ name: name("environment"), kind }).superRefine((v, ctx) => {
    const n = v.name.toLowerCase();
    if (n !== current.toLowerCase() && taken.has(n)) {
      ctx.addIssue({ code: "custom", path: ["name"], message: `${v.name} is already taken here.` });
    }
  });
export type EditEnvironmentValues = z.infer<ReturnType<typeof editEnvironmentSchema>>;

export const newEnvironmentSchema = (taken: ReadonlySet<string>) =>
  z.object({ name: name("environment"), kind }).superRefine((v, ctx) => {
    if (taken.has(v.name.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["name"], message: `An environment named ${v.name} already exists here.` });
    }
  });
export type NewEnvironmentValues = z.infer<ReturnType<typeof newEnvironmentSchema>>;

/** New organisation: its name, and the first project and environment it starts with. */
export const newOrganizationSchema = z.object({ organization: name("organisation"), project: name("project"), environment: name("environment") });
export type NewOrganizationValues = z.infer<typeof newOrganizationSchema>;

export const renameOrganizationSchema = z.object({ name: name("organisation") });
export type RenameOrganizationValues = z.infer<typeof renameOrganizationSchema>;
