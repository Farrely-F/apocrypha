// The decrypt scramble, made scrubbable: characters resolve left to right and the
// rest are noise. Noise is a pure function of (seed, index, step), so the same
// scroll position always paints the same frame and nothing random runs in render.

const GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_|#%";

function hash(a: number, b: number, c: number) {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ Math.imul(c + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function clamp01(n: number) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** `to` resolved up to `progress` (0..1); the remainder is deterministic noise. */
export function resolveText(to: string, progress: number, seed: number, step: number) {
  if (progress >= 1) return to;
  const resolved = Math.floor(clamp01(progress) * to.length);
  let out = to.slice(0, resolved);
  for (let i = resolved; i < to.length; i++) {
    out += GLYPHS[hash(seed, i, step) % GLYPHS.length];
  }
  return out;
}
