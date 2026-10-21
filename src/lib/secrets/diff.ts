// Line diff for showing what changed between two versions of a value. The
// common prefix and suffix are peeled off first, so the quadratic part only
// runs on the lines that actually differ.

/** Largest LCS table we will build (about 4 MB of memory). */
const MAX_DIFF_CELLS = 1_000_000;

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: "same", text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const n = midA.length;
  const m = midB.length;

  // The table below is n*m cells. Past this, show the middle as replaced
  // wholesale instead of allocating something huge.
  if (n * m > MAX_DIFF_CELLS) {
    out.push(...midA.map((text): DiffLine => ({ kind: "del", text })), ...midB.map((text): DiffLine => ({ kind: "add", text })));
    for (let k = endA; k < a.length; k++) out.push({ kind: "same", text: a[k] });
    return out;
  }

  // Longest common subsequence of the differing middle.
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  const removed: DiffLine[] = [];
  const added: DiffLine[] = [];
  const flush = () => {
    out.push(...removed, ...added);
    removed.length = 0;
    added.length = 0;
  };
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      flush();
      out.push({ kind: "same", text: midA[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      removed.push({ kind: "del", text: midA[i++] });
    } else {
      added.push({ kind: "add", text: midB[j++] });
    }
  }
  while (i < n) removed.push({ kind: "del", text: midA[i++] });
  while (j < m) added.push({ kind: "add", text: midB[j++] });
  flush();

  for (let k = endA; k < a.length; k++) out.push({ kind: "same", text: a[k] });
  return out;
}
