import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

const kinds = (a: string, b: string) => diffLines(a, b).map((l) => `${l.kind}:${l.text}`);

describe("diffLines", () => {
  it("marks identical text as unchanged", () => {
    expect(kinds("a\nb", "a\nb")).toEqual(["same:a", "same:b"]);
  });

  it("finds an added, a removed and a changed line", () => {
    expect(kinds("a\nb", "a\nb\nc")).toEqual(["same:a", "same:b", "add:c"]);
    expect(kinds("a\nb\nc", "a\nc")).toEqual(["same:a", "del:b", "same:c"]);
    expect(kinds("a\nb\nc", "a\nX\nc")).toEqual(["same:a", "del:b", "add:X", "same:c"]);
  });

  it("handles empty sides", () => {
    expect(kinds("", "x")).toEqual(["del:", "add:x"]);
    expect(kinds("x", "")).toEqual(["del:x", "add:"]);
    expect(kinds("", "")).toEqual(["same:"]);
  });

  it("copes with a large value without blowing up", () => {
    const a = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    const b = a.replace("line 1000", "changed");
    const d = diffLines(a, b);
    expect(d.filter((l) => l.kind !== "same")).toEqual([
      { kind: "del", text: "line 1000" },
      { kind: "add", text: "changed" },
    ]);
  });

  it("falls back to replacing the middle when the table would be huge", () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join("\n");
    const d = diffLines(a, b);
    expect(d.filter((l) => l.kind === "del")).toHaveLength(3000);
    expect(d.filter((l) => l.kind === "add")).toHaveLength(3000);
  });
});
