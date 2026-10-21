// .env parsing and writing. Pure and dependency-free so it runs in the
// browser, where the plaintext lives. No ${VAR} interpolation: a secrets
// store should hand back exactly what was put in.

export type DotenvEntry = { name: string; value: string };
export type DotenvError = { line: number; message: string };
export type DotenvResult = {
  entries: DotenvEntry[];
  errors: DotenvError[];
  /** Names that appeared more than once; the last one won. */
  duplicates: string[];
};

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PAIR = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };

export function parseDotenv(text: string): DotenvResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const found = new Map<string, string>();
  const errors: DotenvError[] = [];
  const duplicates = new Set<string>();

  const put = (name: string, value: string) => {
    if (found.has(name)) {
      duplicates.add(name);
      found.delete(name); // re-insert so the last occurrence also sorts last
    }
    found.set(name, value);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "" || raw.startsWith("#")) continue;

    const m = PAIR.exec(raw);
    if (!m) {
      errors.push({ line: i + 1, message: "Not a NAME=value line." });
      continue;
    }
    const name = m[1];
    const rest = m[2].replace(/^\s+/, "");

    if (rest.startsWith('"') || rest.startsWith("'")) {
      const quote = rest[0];
      // Scan across lines for the closing quote.
      let value = "";
      let j = i;
      let pos = 1;
      let src = rest;
      let closed = false;
      scan: for (;;) {
        while (pos < src.length) {
          const ch = src[pos];
          if (quote === '"' && ch === "\\" && pos + 1 < src.length) {
            const nx = src[pos + 1];
            value += ESCAPES[nx] ?? "\\" + nx;
            pos += 2;
            continue;
          }
          if (ch === quote) {
            closed = true;
            break scan;
          }
          value += ch;
          pos++;
        }
        j++;
        if (j >= lines.length) break;
        value += "\n";
        src = lines[j];
        pos = 0;
      }
      if (!closed) {
        errors.push({ line: i + 1, message: "Quote is never closed." });
        continue; // resume on the next line
      }
      put(name, value);
      i = j;
      continue;
    }

    // Unquoted: a ` #` starts a comment.
    const cut = rest.search(/\s#/);
    put(name, (cut === -1 ? rest : rest.slice(0, cut)).trim());
  }

  return {
    entries: [...found].map(([name, value]) => ({ name, value })),
    errors,
    duplicates: [...duplicates],
  };
}

const BARE = /^[A-Za-z0-9_./:@%+=,-]*$/;

/** Write entries as a .env file that parseDotenv reads back exactly. */
export function serializeDotenv(entries: readonly DotenvEntry[]): string {
  return entries
    .map(({ name, value }) => {
      if (!NAME.test(name)) throw new Error(`Not a valid variable name: ${name}`);
      if (BARE.test(value)) return `${name}=${value}\n`;
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `${name}="${escaped}"\n`;
    })
    .join("");
}
