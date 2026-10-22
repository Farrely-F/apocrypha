import { z } from "@/lib/zod";

/** The dev-only email and password sign-in (APOCRYPHA_TEST_AUTH=1). */
export const devSignInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});
export type DevSignInValues = z.infer<typeof devSignInSchema>;

/** The six digits from an authenticator app. Spaces are forgiven; letters are not. */
export const totpCodeSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6 digits from your authenticator app.")),
});
export type TotpCodeValues = z.input<typeof totpCodeSchema>;

/** One of the single-use backup codes, with or without its dash. */
export const backupCodeSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().min(6, "Enter one of your backup codes.").max(32, "That is too long for a backup code.")),
});
export type BackupCodeValues = z.input<typeof backupCodeSchema>;

/** Plain-language text for the two-factor error codes Better Auth returns. */
export function twoFactorErrorMessage(code: string | undefined): string {
  switch (code) {
    case "INVALID_CODE":
      return "That code is not right. Codes change every 30 seconds: wait for the next one and try again.";
    case "INVALID_BACKUP_CODE":
      return "That backup code is not right, or it has already been used.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many wrong codes. Wait a few minutes before trying again.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in has expired. Go back and sign in again.";
    case "RECENT_SIGN_IN_REQUIRED":
      return "For your safety, sign out and sign in again, then retry. This needs a sign-in from the last 15 minutes.";
    default:
      return "That didn't work. Try again.";
  }
}
