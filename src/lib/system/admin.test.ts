import { describe, expect, it } from "vitest";
import { adminEmails, adminEnabled, can, decideAdmin, isListedAdmin, maskEmail, sessionWindowMs, SYSTEM_PERMISSIONS } from "./admin";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const env = { SYSTEM_ADMIN_EMAILS: " Me@Example.com , other@example.com" };
const ok = { email: "me@example.com", emailVerified: true, sessionCreatedAt: NOW - 10 * 60_000, now: NOW };

describe("who the administrator is", () => {
  it("reads a comma-separated list of emails, trimmed and lower-cased, ignoring junk", () => {
    expect(adminEmails(env)).toEqual(["me@example.com", "other@example.com"]);
    expect(adminEmails({ SYSTEM_ADMIN_EMAILS: "not-an-email, a@b.co ,, @x.com, a b@c.de" })).toEqual(["a@b.co"]);
    expect(adminEmails({})).toEqual([]);
  });

  it("does not exist unless configured: unset or empty is 'off'", () => {
    expect(decideAdmin(ok, {}).status).toBe("off");
    expect(decideAdmin(ok, { SYSTEM_ADMIN_EMAILS: "" }).status).toBe("off");
    expect(decideAdmin(ok, { SYSTEM_ADMIN_EMAILS: "junk" }).status).toBe("off");
  });

  it("can be switched off without touching the list: the feature flag", () => {
    for (const off of ["false", "FALSE", "0", "off", "no", " Off "]) {
      const e = { ...env, SYSTEM_ADMIN_ENABLED: off };
      expect(adminEnabled(e), off).toBe(false);
      expect(decideAdmin(ok, e).status, off).toBe("off");
      expect(isListedAdmin("me@example.com", e), off).toBe(false); // and the menu link goes with it
    }
    for (const on of [undefined, "", "true", "1", "on"]) {
      const e = { ...env, SYSTEM_ADMIN_ENABLED: on };
      expect(adminEnabled(e), String(on)).toBe(true);
      expect(decideAdmin(ok, e).status, String(on)).toBe("ok");
    }
    expect(adminEnabled({ SYSTEM_ADMIN_ENABLED: "true" })).toBe(false); // on, but nobody listed: nothing to show
  });

  it("is the listed email, matched without regard to case, and nobody else", () => {
    expect(decideAdmin(ok, env).status).toBe("ok");
    expect(decideAdmin({ ...ok, email: "ME@EXAMPLE.COM" }, env).status).toBe("ok");
    expect(decideAdmin({ ...ok, email: "mallory@example.com" }, env).status).toBe("not-admin");
    expect(decideAdmin({ ...ok, email: "me@example.com.evil.io" }, env).status).toBe("not-admin");
    expect(decideAdmin({ ...ok, email: "xme@example.com" }, env).status).toBe("not-admin");
  });

  it("needs the provider to have verified the address", () => {
    expect(decideAdmin({ ...ok, emailVerified: false }, env).status).toBe("unverified");
  });

  it("needs a recent sign-in: an hour by default, adjustable, never absurd", () => {
    expect(decideAdmin({ ...ok, sessionCreatedAt: NOW - 59 * 60_000 }, env).status).toBe("ok");
    expect(decideAdmin({ ...ok, sessionCreatedAt: NOW - 61 * 60_000 }, env).status).toBe("stale");
    expect(decideAdmin({ ...ok, sessionCreatedAt: NOW - 3 * 3_600_000 }, { ...env, SYSTEM_ADMIN_SESSION_MINUTES: "240" }).status).toBe("ok");
    expect(sessionWindowMs({ SYSTEM_ADMIN_SESSION_MINUTES: "1" })).toBe(60 * 60_000); // below the floor: default
    expect(sessionWindowMs({ SYSTEM_ADMIN_SESSION_MINUTES: "999999" })).toBe(60 * 60_000); // above the ceiling: default
    expect(decideAdmin({ ...ok, sessionCreatedAt: NOW + 3_600_000 }, env).status).toBe("stale"); // a session dated in the future
    expect(decideAdmin({ ...ok, sessionCreatedAt: "garbage" }, env).status).toBe("stale");
  });

  it("checks the list on every call, so removing someone takes effect at once", () => {
    expect(decideAdmin(ok, env).status).toBe("ok");
    expect(decideAdmin(ok, { SYSTEM_ADMIN_EMAILS: "other@example.com" }).status).toBe("not-admin");
  });

  it("has one role that holds every named permission, and only while the decision is ok", () => {
    for (const p of SYSTEM_PERMISSIONS) {
      expect(can({ status: "ok" }, p)).toBe(true);
      for (const s of ["off", "not-admin", "unverified", "stale"] as const) expect(can({ status: s }, p)).toBe(false);
    }
    expect(SYSTEM_PERMISSIONS).toContain("users.reveal_email");
  });

  it("shows the menu link to a listed address only", () => {
    expect(isListedAdmin("Me@example.com", env)).toBe(true);
    expect(isListedAdmin("someone@example.com", env)).toBe(false);
    expect(isListedAdmin("me@example.com", {})).toBe(false);
  });
});

describe("masking an email", () => {
  it("keeps the first character and the domain, and hides how long the name is", () => {
    expect(maskEmail("alice@gmail.com")).toBe("a•••••@gmail.com");
    expect(maskEmail("al@x.io")).toBe("a•••••@x.io");
    expect(maskEmail("a-very-long-address-indeed@x.io")).toBe("a•••••@x.io");
    expect(maskEmail("nonsense")).toBe("•••");
    expect(maskEmail("alice@gmail.com")).not.toContain("lice");
  });
});
