import { describe, expect, it, vi } from "vitest";
import { cleanFields, errorFields, log, logLine, redactText } from "./log";

const NOW = new Date("2026-10-22T12:00:00Z");
const parse = (line: string) => JSON.parse(line) as Record<string, unknown>;

describe("structured log lines", () => {
  it("is one JSON object with a timestamp, a level and a stable event name", () => {
    const line = logLine("info", "admin.access", { action: "view_users", actorId: "abc12345def" }, NOW);
    expect(line).not.toContain("\n");
    expect(parse(line)).toEqual({ ts: "2026-10-22T12:00:00.000Z", level: "info", event: "admin.access", action: "view_users", actorId: "abc12345def" });
  });

  it("writes only the fields it allows, and drops everything else", () => {
    const f = cleanFields("request.error", { route: "/o/[orgId]", status: 500, email: "a@b.co", body: "x", ip: "1.2.3.4", userAgent: "UA", userId: "u1", errorName: "TypeError", secret: "s3cret" });
    expect(f).toEqual({ route: "/o/[orgId]", status: 500, errorName: "TypeError" });
  });

  it("carries a user id only on admin events, where accountability needs it", () => {
    expect(cleanFields("admin.access", { actorId: "abc12345" })).toEqual({ actorId: "abc12345" });
    expect(cleanFields("request.error", { actorId: "abc12345" })).toEqual({});
    expect(cleanFields("rate_limit.refused", { actorId: "abc12345", bucket: "auth-sign-in" })).toEqual({ bucket: "auth-sign-in" });
    expect(cleanFields("admin.access", { actorId: "a@b.co" }).actorId).toBe("abco"); // stripped to id characters; an address cannot pass
  });

  it("scrubs what survives: emails, tokens, cookies, sealed blobs, ids and long encodings", () => {
    const hostile = [
      "failed for alice@example.com",
      "Authorization: Bearer abcdefghijklmnop123456",
      "cookie better-auth.session_token=abc123.sig; path=/",
      "stored v1|a256gcm|AAAAAAAAAAAAAAAA|ciphertextciphertextcipher",
      "org 3f2b1c9a-1234-4abc-8def-0123456789ab missing",
      "blob " + "A".repeat(60),
      "password=hunter2 code=123456",
    ];
    const out = hostile.map(redactText).join(" | ");
    for (const leak of ["alice@example.com", "abcdefghijklmnop123456", "abc123.sig", "ciphertextciphertext", "3f2b1c9a-1234", "A".repeat(40), "hunter2", "123456"]) {
      expect(out, leak).not.toContain(leak);
    }
    expect(out).toContain("<email>");
    expect(out).toContain("<sealed>");
  });

  it("scrubs the values of allowed fields too, because a route or code string can carry one", () => {
    const f = cleanFields("request.error", { route: "/s/3f2b1c9a-1234-4abc-8def-0123456789ab", errorCode: "bad alice@example.com" });
    expect(JSON.stringify(f)).not.toMatch(/alice|3f2b1c9a/);
  });

  it("truncates long values", () => {
    expect(redactText("x ".repeat(400)).length).toBeLessThanOrEqual(303);
  });

  it("logs an error by class and code, never its message", () => {
    const e = Object.assign(new Error("duplicate key for alice@example.com"), { code: "SQLITE_CONSTRAINT" });
    expect(errorFields(e)).toEqual({ errorName: "Error", errorCode: "SQLITE_CONSTRAINT" });
    expect(JSON.stringify(errorFields(e))).not.toContain("alice");
    expect(errorFields({ code: "E1" })).toEqual({ errorName: "object", errorCode: "E1" });
    expect(errorFields(undefined)).toEqual({ errorName: "undefined" });
  });

  it("goes to the right stream for its level", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log.info("a.b");
    log.warn("a.b");
    log.error("a.b", { status: 500 });
    expect([out.mock.calls.length, warn.mock.calls.length, err.mock.calls.length]).toEqual([1, 1, 1]);
    expect(parse(err.mock.calls[0][0] as string)).toMatchObject({ level: "error", event: "a.b", status: 500 });
    vi.restoreAllMocks();
  });
});
