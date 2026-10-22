import { z } from "@/lib/zod";
import { passphraseStrength } from "./strength";

/** A new passphrase must be strong and typed twice. Not trimmed: spaces count. */
function checkNewPassphrase(v: { passphrase: string; confirm: string }, ctx: z.RefinementCtx) {
  const s = passphraseStrength(v.passphrase);
  if (!s.ok) ctx.addIssue({ code: "custom", path: ["passphrase"], message: s.hint });
  if (v.passphrase !== v.confirm) {
    ctx.addIssue({ code: "custom", path: ["confirm"], message: "The passphrases don't match." });
  }
}

/** Create a vault: a strong passphrase, typed twice. */
export const createVaultSchema = z
  .object({ passphrase: z.string(), confirm: z.string() })
  .superRefine(checkNewPassphrase);
export type CreateVaultValues = z.infer<typeof createVaultSchema>;

/** Letters and digits only, lower-cased, so dashes and spacing never matter. */
const squash = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

/** Prove the recovery key was saved by typing back its last four characters. */
export const recoveryConfirmSchema = (recoveryKey: string) => {
  const tail = squash(recoveryKey).slice(-4);
  return z.object({
    typed: z.string().refine((t) => squash(t) === tail, "That is not the last 4 characters of the key."),
  });
};
export type RecoveryConfirmValues = z.infer<ReturnType<typeof recoveryConfirmSchema>>;

export const unlockSchema = z.object({
  passphrase: z.string().min(1, "Enter your vault passphrase."),
  trust: z.boolean(),
});
export type UnlockValues = z.infer<typeof unlockSchema>;

/** Set a new passphrase from the recovery key. */
export const recoveryUnlockSchema = z
  .object({ recoveryKey: z.string().min(1, "Enter your recovery key."), passphrase: z.string(), confirm: z.string() })
  .superRefine(checkNewPassphrase);
export type RecoveryUnlockValues = z.infer<typeof recoveryUnlockSchema>;

/** Change the passphrase while unlocked. */
export const changePassphraseSchema = z
  .object({ current: z.string().min(1, "Enter your current passphrase."), passphrase: z.string(), confirm: z.string() })
  .superRefine(checkNewPassphrase);
export type ChangePassphraseValues = z.infer<typeof changePassphraseSchema>;
