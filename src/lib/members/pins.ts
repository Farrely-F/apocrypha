// Trust on first use: the first public key this browser sees for a person in an org is
// remembered, and a later change is flagged. Keys come from the server, so without this a
// compromised server could swap one in and receive every new environment key.
const KEY = "apocrypha:key-pins";

type Pins = Record<string, string>;

function read(): Pins {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Pins;
  } catch {
    return {};
  }
}

const slot = (orgId: string, userId: string) => `${orgId}:${userId}`;

/** Remember keys not seen before; return the user ids whose key differs from the remembered one. */
export function checkPins(orgId: string, members: { userId: string; publicKey: string | null }[]): string[] {
  const pins = read();
  const changed: string[] = [];
  let dirty = false;
  for (const m of members) {
    if (!m.publicKey) continue;
    const have = pins[slot(orgId, m.userId)];
    if (!have) {
      pins[slot(orgId, m.userId)] = m.publicKey;
      dirty = true;
    } else if (have !== m.publicKey) changed.push(m.userId);
  }
  if (dirty) {
    try {
      localStorage.setItem(KEY, JSON.stringify(pins));
    } catch {
      /* storage unavailable: no pinning, the other checks still apply */
    }
  }
  return changed;
}

/** The admin has compared the new fingerprint and accepts it. */
export function acceptKeys(orgId: string, members: { userId: string; publicKey: string | null }[]) {
  const pins = read();
  for (const m of members) if (m.publicKey) pins[slot(orgId, m.userId)] = m.publicKey;
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* ignore */
  }
}
