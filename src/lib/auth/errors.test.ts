import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./errors";

describe("signInErrorMessage", () => {
  it("says nothing when there is no error", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });

  it("explains the cases a person can act on", () => {
    expect(signInErrorMessage("access_denied")).toMatch(/cancel|denied|didn't allow/i);
    expect(signInErrorMessage("account_not_linked")).toMatch(/verified|link/i);
    expect(signInErrorMessage("email_not_found")).toMatch(/email/i);
  });

  it("falls back to a generic message and never echoes the code back into the page", () => {
    const m = signInErrorMessage("<script>alert(1)</script>");
    expect(m).toMatch(/didn't complete/i);
    expect(m).not.toContain("script");
  });
});
