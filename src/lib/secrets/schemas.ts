import { z } from "zod";
import { MAX_SECRET_VALUE_BYTES } from "../crypto";

/** Same shape as the variable names a .env file allows. */
export const secretNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, digits and underscores, and don't start with a digit.");

/** Values are kept exactly as typed (no trimming) and capped in bytes, not characters. */
const valueSchema = z
  .string()
  .min(1, "Enter a value.")
  .refine((v) => new TextEncoder().encode(v).length <= MAX_SECRET_VALUE_BYTES, "Values can be at most 64 KB.");

/** The add-a-secret form. `taken` is every existing name: the server cannot see them, so the browser checks. */
export const newSecretSchema = (taken: ReadonlySet<string>) =>
  z
    .object({ name: secretNameSchema, value: valueSchema })
    .superRefine((v, ctx) => {
      if (taken.has(v.name)) {
        ctx.addIssue({ code: "custom", path: ["name"], message: `A secret named ${v.name} already exists.` });
      }
    });
export type NewSecretValues = z.infer<ReturnType<typeof newSecretSchema>>;

/** Editing one secret: `others` are the other secrets' names, `original` is what was opened. */
export const editSecretSchema = (others: ReadonlySet<string>, original: { name: string; value: string }) =>
  z
    .object({ name: secretNameSchema, value: valueSchema })
    .superRefine((v, ctx) => {
      if (v.name !== original.name && others.has(v.name)) {
        ctx.addIssue({ code: "custom", path: ["name"], message: `A secret named ${v.name} already exists.` });
      } else if (v.name === original.name && v.value === original.value) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Nothing changed." });
      }
    });
export type EditSecretValues = z.infer<ReturnType<typeof editSecretSchema>>;

export const dotenvImportSchema = z.object({
  text: z.string().refine((t) => t.trim() !== "", "Paste a .env file or load one."),
  overwrite: z.boolean(),
});
export type DotenvImportValues = z.infer<typeof dotenvImportSchema>;
