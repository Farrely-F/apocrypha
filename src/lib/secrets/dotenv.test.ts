import { describe, expect, it } from "vitest";
import { parseDotenv, serializeDotenv } from "./dotenv";

describe("parseDotenv", () => {
  it("reads plain KEY=value lines, comments and blanks", () => {
    const r = parseDotenv("# comment\n\nA=1\nB=two words\n  C = 3  \n");
    expect(r.entries).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "two words" },
      { name: "C", value: "3" },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("accepts export, CRLF and a trailing newline", () => {
    const r = parseDotenv("export A=1\r\nexport B=2\r\n");
    expect(r.entries).toEqual([{ name: "A", value: "1" }, { name: "B", value: "2" }]);
  });

  it("handles quotes: single is literal, double expands \\n and \\\"", () => {
    const r = parseDotenv(`A='raw \\n kept'\nB="line1\\nline2"\nC="say \\"hi\\""\nD=""\n`);
    expect(r.entries).toEqual([
      { name: "A", value: "raw \\n kept" },
      { name: "B", value: "line1\nline2" },
      { name: "C", value: 'say "hi"' },
      { name: "D", value: "" },
    ]);
  });

  it("reads multi-line double-quoted values", () => {
    const r = parseDotenv('KEY="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1\n');
    expect(r.entries).toEqual([
      { name: "KEY", value: "-----BEGIN-----\nabc\n-----END-----" },
      { name: "NEXT", value: "1" },
    ]);
  });

  it("strips inline comments from unquoted values only", () => {
    const r = parseDotenv('A=value # note\nB="value # kept"\nC=url#fragment\n');
    expect(r.entries).toEqual([
      { name: "A", value: "value" },
      { name: "B", value: "value # kept" },
      { name: "C", value: "url#fragment" },
    ]);
  });

  it("keeps = inside values", () => {
    expect(parseDotenv("URL=postgres://u:p@h/db?x=1&y=2\n").entries[0].value).toBe("postgres://u:p@h/db?x=1&y=2");
  });

  it("reports bad lines with their number and keeps the good ones", () => {
    const r = parseDotenv("A=1\nnot a pair\n1BAD=2\nB=2\n");
    expect(r.entries.map((e) => e.name)).toEqual(["A", "B"]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("reports an unterminated quote", () => {
    const r = parseDotenv('A="never closed\nB=2\n');
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].line).toBe(1);
  });

  it("lets a later duplicate win and says so", () => {
    const r = parseDotenv("A=1\nA=2\n");
    expect(r.entries).toEqual([{ name: "A", value: "2" }]);
    expect(r.duplicates).toEqual(["A"]);
  });
});

describe("serializeDotenv", () => {
  it("writes simple values bare and everything else quoted", () => {
    const out = serializeDotenv([
      { name: "A", value: "simple" },
      { name: "B", value: "has space" },
      { name: "C", value: "line1\nline2" },
      { name: "D", value: 'q"uote' },
      { name: "E", value: "" },
      { name: "F", value: "a#b" },
    ]);
    expect(out).toBe('A=simple\nB="has space"\nC="line1\\nline2"\nD="q\\"uote"\nE=\nF="a#b"\n');
  });

  it("round-trips awkward values exactly", () => {
    const entries = [
      { name: "PLAIN", value: "abc123" },
      { name: "SPACES", value: "  padded  " },
      { name: "MULTI", value: "-----BEGIN KEY-----\nAAA\nBBB\n-----END KEY-----\n" },
      { name: "QUOTES", value: `it's "quoted"` },
      { name: "BACKSLASH", value: "C:\\path\\to\\file" },
      { name: "HASH", value: "pass#word # not a comment" },
      { name: "EQ", value: "a=b=c" },
      { name: "UNICODE", value: "héllo ✓" },
      { name: "EMPTY", value: "" },
      { name: "DOLLAR", value: "$HOME and ${X}" },
    ];
    const back = parseDotenv(serializeDotenv(entries));
    expect(back.errors).toEqual([]);
    expect(back.entries).toEqual(entries);
  });
});
