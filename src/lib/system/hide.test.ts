import { describe, expect, it } from "vitest";
import { hideAdminPage, isAdminPath } from "./hide";

const NOW = Date.now();
const env = { SYSTEM_ADMIN_EMAILS: "boss@example.com" };
const session = (over: Partial<{ email: string; emailVerified: boolean; createdAt: number }> = {}) => async () => ({
  user: { email: over.email ?? "boss@example.com", emailVerified: over.emailVerified ?? true },
  session: { createdAt: over.createdAt ?? NOW - 60_000 },
});

describe("which paths are the administrator's", () => {
  it("is /admin and what is under it, not look-alikes", () => {
    for (const p of ["/admin", "/admin/", "/admin/users", "/admin/access"]) expect(isAdminPath(p), p).toBe(true);
    for (const p of ["/administrator", "/admin-panel", "/dashboard/admin", "/", "/api/system/reveal", "/o/x/admin"]) expect(isAdminPath(p), p).toBe(false);
  });
});

describe("when the page should not exist", () => {
  it("is hidden when the feature is off, without looking at the session at all", async () => {
    let looked = false;
    const spy = async () => {
      looked = true;
      return null;
    };
    expect(await hideAdminPage(spy, {})).toBe(true);
    expect(await hideAdminPage(spy, { SYSTEM_ADMIN_EMAILS: "boss@example.com", SYSTEM_ADMIN_ENABLED: "false" })).toBe(true);
    expect(looked).toBe(false);
  });

  it("is hidden from a signed-out visitor, another person, an unverified address, and a session that cannot be read", async () => {
    expect(await hideAdminPage(async () => null, env)).toBe(true);
    expect(await hideAdminPage(session({ email: "other@example.com" }), env)).toBe(true);
    expect(await hideAdminPage(session({ emailVerified: false }), env)).toBe(true);
    expect(await hideAdminPage(async () => { throw new Error("db down"); }, env)).toBe(true);
  });

  it("is shown to the administrator, including one whose sign-in is old (the page asks them to sign in again)", async () => {
    expect(await hideAdminPage(session(), env)).toBe(false);
    expect(await hideAdminPage(session({ email: "BOSS@example.com" }), env)).toBe(false);
    expect(await hideAdminPage(session({ createdAt: NOW - 3 * 3_600_000 }), env)).toBe(false);
  });
});
