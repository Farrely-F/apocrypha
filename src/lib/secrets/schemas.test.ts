import { describe, expect, it } from "vitest";
import { dotenvImportSchema, editSecretSchema, newSecretSchema, secretNameSchema } from "./schemas";

describe("secretNameSchema", () => {
  it("accepts environment variable names", () => {
    for (const n of ["A", "_x", "DATABASE_URL", "a1_b2"]) expect(secretNameSchema.safeParse(n).success).toBe(true);
  });
  it("trims, then refuses anything else", () => {
    expect(secretNameSchema.parse("  FOO  ")).toBe("FOO");
    for (const n of ["", "1BAD", "has space", "dash-ed", "dot.ted", "ünï"]) {
      expect(secretNameSchema.safeParse(n).success).toBe(false);
    }
  });
});

describe("newSecretSchema", () => {
  const schema = newSecretSchema(new Set(["TAKEN"]));
  it("accepts a new name with a value, keeping the value exactly", () => {
    const r = schema.safeParse({ name: " NEW ", value: "  spaced\nvalue  " });
    expect(r.success && r.data).toEqual({ name: "NEW", value: "  spaced\nvalue  " });
  });
  it("refuses a taken name on the name field, and an empty value on the value field", () => {
    const t = schema.safeParse({ name: "TAKEN", value: "x" });
    expect(!t.success && t.error.issues[0].path).toEqual(["name"]);
    expect(!t.success && t.error.issues[0].message).toMatch(/already exists/);
    const e = schema.safeParse({ name: "OK", value: "" });
    expect(!e.success && e.error.issues[0].path).toEqual(["value"]);
  });
  it("caps a value at 64 KB measured in bytes", () => {
    expect(schema.safeParse({ name: "OK", value: "a".repeat(65536) }).success).toBe(true);
    expect(schema.safeParse({ name: "OK", value: "a".repeat(65537) }).success).toBe(false);
    expect(schema.safeParse({ name: "OK", value: "é".repeat(32769) }).success).toBe(false); // 2 bytes each
  });
});

describe("editSecretSchema", () => {
  const schema = editSecretSchema(new Set(["OTHER"]), { name: "MINE", value: "old" });
  it("accepts a change to the value or the name", () => {
    expect(schema.safeParse({ name: "MINE", value: "new" }).success).toBe(true);
    expect(schema.safeParse({ name: "RENAMED", value: "old" }).success).toBe(true);
  });
  it("refuses no change, a rename onto another secret, and an empty value", () => {
    expect(schema.safeParse({ name: "MINE", value: "old" }).success).toBe(false);
    expect(schema.safeParse({ name: "OTHER", value: "x" }).success).toBe(false);
    expect(schema.safeParse({ name: "MINE", value: "" }).success).toBe(false);
  });
});

describe("dotenvImportSchema", () => {
  it("needs something to import", () => {
    expect(dotenvImportSchema.safeParse({ text: "   ", overwrite: false }).success).toBe(false);
    expect(dotenvImportSchema.safeParse({ text: "A=1", overwrite: true }).success).toBe(true);
  });
});
