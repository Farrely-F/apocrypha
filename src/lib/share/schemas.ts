import { z } from "@/lib/zod";
import { MAX_VIEWS } from "./payload";

/** Minutes; "0" means no time limit (then a view limit is required). */
export const EXPIRY_OPTIONS = [
  { value: "60", label: "1 hour" },
  { value: "1440", label: "24 hours" },
  { value: "10080", label: "7 days" },
  { value: "43200", label: "30 days" },
  { value: "0", label: "No time limit" },
] as const;

export const newShareSchema = z
  .object({ protect: z.boolean(), password: z.string(), expiry: z.string(), views: z.string() })
  .superRefine((v, ctx) => {
    if (v.protect && v.password.length < 8) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Use at least 8 characters." });
    }
    const views = v.views.trim();
    if (views !== "" && !(/^\d+$/.test(views) && Number(views) >= 1 && Number(views) <= MAX_VIEWS)) {
      ctx.addIssue({ code: "custom", path: ["views"], message: `Enter a whole number from 1 to ${MAX_VIEWS}, or leave it empty.` });
    }
    if (v.expiry === "0" && views === "") {
      ctx.addIssue({ code: "custom", path: ["views"], message: "Set a view limit or choose an expiry. A link must not live forever." });
    }
  });
export type NewShareValues = z.infer<typeof newShareSchema>;
