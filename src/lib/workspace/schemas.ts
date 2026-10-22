import { z } from "@/lib/zod";

/** Plaintext names: short, printable, no control characters. */
const name = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Give the ${what} a name.`)
    .max(64, "Use at most 64 characters.")
    .refine((v) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v), "Use only printable characters.");

/** New project: its name, and the name of the first environment it starts with. */
export const newProjectSchema = (taken: ReadonlySet<string>) =>
  z
    .object({ name: name("project"), environment: name("environment") })
    .superRefine((v, ctx) => {
      if (taken.has(v.name.toLowerCase())) {
        ctx.addIssue({ code: "custom", path: ["name"], message: `A project named ${v.name} already exists.` });
      }
    });
export type NewProjectValues = z.infer<ReturnType<typeof newProjectSchema>>;

export const newEnvironmentSchema = (taken: ReadonlySet<string>) =>
  z.object({ name: name("environment") }).superRefine((v, ctx) => {
    if (taken.has(v.name.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["name"], message: `An environment named ${v.name} already exists here.` });
    }
  });
export type NewEnvironmentValues = z.infer<ReturnType<typeof newEnvironmentSchema>>;

export const renameSchema = (taken: ReadonlySet<string>, current: string) =>
  z.object({ name: name("name") }).superRefine((v, ctx) => {
    const n = v.name.toLowerCase();
    if (n !== current.toLowerCase() && taken.has(n)) {
      ctx.addIssue({ code: "custom", path: ["name"], message: `${v.name} is already taken here.` });
    }
  });
export type RenameValues = z.infer<ReturnType<typeof renameSchema>>;

/** New organisation: its name, and the first project and environment it starts with. */
export const newOrganizationSchema = z.object({ organization: name("organisation"), project: name("project"), environment: name("environment") });
export type NewOrganizationValues = z.infer<typeof newOrganizationSchema>;

export const renameOrganizationSchema = z.object({ name: name("organisation") });
export type RenameOrganizationValues = z.infer<typeof renameOrganizationSchema>;
