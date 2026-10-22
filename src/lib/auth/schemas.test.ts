import { describe, expect, it } from "vitest";
import { devSignInSchema } from "./schemas";

describe("devSignInSchema", () => {
  it("accepts an email and a password", () => {
    expect(devSignInSchema.safeParse({ email: "a@b.co", password: "test-password-123" }).success).toBe(true);
  });
  it("refuses a bad email or a short password with a message for the right field", () => {
    const e = devSignInSchema.safeParse({ email: "nope", password: "test-password-123" });
    expect(!e.success && e.error.issues[0].path).toEqual(["email"]);
    const p = devSignInSchema.safeParse({ email: "a@b.co", password: "short" });
    expect(!p.success && p.error.issues[0].path).toEqual(["password"]);
  });
});

import { backupCodeSchema, totpCodeSchema, twoFactorErrorMessage } from "./schemas";

describe("totpCodeSchema", () => {
  it("accepts six digits, with or without a space in the middle", () => {
    expect(totpCodeSchema.parse({ code: "123456" }).code).toBe("123456");
    expect(totpCodeSchema.parse({ code: "123 456" }).code).toBe("123456");
  });
  it("refuses anything else", () => {
    for (const code of ["", "12345", "1234567", "12345a", "abcdef"]) expect(totpCodeSchema.safeParse({ code }).success).toBe(false);
  });
});

describe("backupCodeSchema", () => {
  it("takes a code with or without whitespace and refuses an empty or huge one", () => {
    expect(backupCodeSchema.parse({ code: " abcde-12345 " }).code).toBe("abcde-12345");
    expect(backupCodeSchema.safeParse({ code: "" }).success).toBe(false);
    expect(backupCodeSchema.safeParse({ code: "x".repeat(40) }).success).toBe(false);
  });
});

describe("twoFactorErrorMessage", () => {
  it("explains known codes and never echoes an unknown one", () => {
    expect(twoFactorErrorMessage("INVALID_CODE")).toMatch(/not right/);
    expect(twoFactorErrorMessage("ACCOUNT_TEMPORARILY_LOCKED")).toMatch(/wait/i);
    expect(twoFactorErrorMessage("<script>")).not.toContain("script");
  });
});
