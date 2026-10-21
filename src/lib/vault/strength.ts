// Passphrase feedback for the vault form. Length does most of the work, so the
// estimate is deliberately simple and conservative: it is a guide, not a proof.
// The real protection is Argon2id plus the server never seeing the passphrase.

export const MIN_PASSPHRASE_LENGTH = 12;

export type StrengthLevel = "short" | "weak" | "fair" | "strong";

export type Strength = {
  level: StrengthLevel;
  /** Rough entropy estimate in bits. */
  bits: number;
  /** Meets the minimum for creating a vault. */
  ok: boolean;
  /** One sentence on what to change, or why it is fine. */
  hint: string;
};

const COMMON = [
  "password",
  "passw0rd",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "apocrypha",
  "secret",
];

function poolSize(p: string): number {
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[0-9]/.test(p)) pool += 10;
  if (/[^A-Za-z0-9]/.test(p)) pool += 33;
  return Math.max(pool, 1);
}

/** Characters beyond the second occurrence of the same one add nothing. */
function effectiveLength(p: string): number {
  const seen = new Map<string, number>();
  let n = 0;
  for (const ch of p) {
    const c = (seen.get(ch) ?? 0) + 1;
    seen.set(ch, c);
    if (c <= 2) n += 1;
  }
  // Short repeating units ("abab...", "abcabc...") collapse to their period.
  for (let period = 1; period <= 4; period++) {
    if (p.length >= period * 4 && p === p.slice(0, period).repeat(Math.ceil(p.length / period)).slice(0, p.length)) {
      return period;
    }
  }
  return n;
}

export function passphraseStrength(passphrase: string): Strength {
  const length = [...passphrase].length;
  if (length < MIN_PASSPHRASE_LENGTH) {
    return {
      level: "short",
      bits: 0,
      ok: false,
      hint: `Use at least ${MIN_PASSPHRASE_LENGTH} characters. Four random words works well.`,
    };
  }

  let bits = effectiveLength(passphrase) * Math.log2(poolSize(passphrase));
  const lower = passphrase.toLowerCase();
  const common = COMMON.find((w) => lower.includes(w));
  if (common) bits = Math.min(bits, 30);

  const level: StrengthLevel = bits < 45 ? "weak" : bits < 70 ? "fair" : "strong";
  const ok = bits >= 45;
  const hint = common
    ? `Avoid common words like "${common}". Four unrelated words is stronger.`
    : !ok
      ? "Too repetitive. Mix in different words or characters."
      : level === "fair"
        ? "Fine to start. Adding another word makes it much harder to guess."
        : "Strong. You will need this to unlock on every new device, so remember it.";
  return { level, bits: Math.round(bits), ok, hint };
}
