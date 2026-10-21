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
