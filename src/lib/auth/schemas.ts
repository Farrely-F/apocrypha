import { z } from "zod";

/** The dev-only email and password sign-in (APOCRYPHA_TEST_AUTH=1). */
export const devSignInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});
export type DevSignInValues = z.infer<typeof devSignInSchema>;
