import { describe, expect, it } from "vitest";
import { inferKind, normalizeTag, parseDescription, parseProjectDetails, parseTags, parseUrl, readTags } from "./meta";
import { parseNewEnvironment, parseNewProject } from "./payload";

describe("environment kind", () => {
  it("guesses from common names and falls back to other", () => {
    expect(inferKind("Production")).toBe("prod");
    expect(inferKind(" prd ")).toBe("prod");
    expect(inferKind("stage")).toBe("staging");
    expect(inferKind("dev")).toBe("dev");
    expect(inferKind("eu-west")).toBe("other");
  });
});

describe("tags", () => {
  it("turns what was typed into a slug", () => {
    expect(normalizeTag("  Payments API ")).toBe("payments-api");
    expect(normalizeTag("--a__b--")).toBe("a-b");
    expect(normalizeTag("héllo!")).toBe("hllo");
    expect(normalizeTag("x".repeat(40))).toHaveLength(24);
  });

  it("accepts a clean list and drops repeats", () => {
    expect(parseTags(["a", "b", "a"])).toEqual({ ok: true, value: ["a", "b"] });
    expect(parseTags(undefined)).toEqual({ ok: true, value: [] });
  });

  it("refuses anything that is not a slug, or too many", () => {
    for (const bad of [["Upper"], ["a b"], ["-a"], ["a-"], [""], [1], ["x".repeat(25)], "a,b"]) expect(parseTags(bad).ok).toBe(false);
    expect(parseTags(Array.from({ length: 9 }, (_, i) => `t${i}`)).ok).toBe(false);
  });

  it("reads a damaged column as no tags", () => {
    expect(readTags("not json")).toEqual([]);
    expect(readTags('["a","B"]')).toEqual([]);
    expect(readTags('["a","b"]')).toEqual(["a", "b"]);
    expect(readTags(null)).toEqual([]);
  });
});

describe("description", () => {
  it("trims, clears when empty, and keeps to one short line", () => {
    expect(parseDescription("  hi ")).toEqual({ ok: true, value: "hi" });
    expect(parseDescription("   ")).toEqual({ ok: true, value: null });
    expect(parseDescription("a".repeat(281)).ok).toBe(false);
    expect(parseDescription("a\nb").ok).toBe(false);
    expect(parseDescription(5).ok).toBe(false);
  });
});

describe("links", () => {
  it("allows https only, with no credentials", () => {
    expect(parseUrl("https://github.com/acme/api", "repoUrl")).toEqual({ ok: true, value: "https://github.com/acme/api" });
    expect(parseUrl("", "repoUrl")).toEqual({ ok: true, value: null });
    for (const bad of ["http://x.dev", "javascript:alert(1)", "https://user:pw@x.dev", "ftp://x.dev", "github.com/a", "https://x.dev/" + "a".repeat(200)]) {
      expect(parseUrl(bad, "repoUrl").ok, bad).toBe(false);
    }
  });
});

describe("details in a body", () => {
  it("includes only the keys that were sent", () => {
    expect(parseProjectDetails({ tags: ["a"] })).toEqual({ ok: true, value: { tags: ["a"] } });
    expect(parseProjectDetails({ description: null, repoUrl: "" })).toEqual({ ok: true, value: { description: null, repoUrl: null } });
    expect(parseProjectDetails({ docsUrl: "http://x.dev" }).ok).toBe(false);
  });
});

describe("create bodies", () => {
  const wrapped = `v1|x25519-hkdf-a256gcm|${"A".repeat(43)}|${"A".repeat(64)}`;
  const environment = { id: crypto.randomUUID(), name: "prod", wrappedKey: wrapped };
  const orgId = crypto.randomUUID();

  it("accepts a kind and details, and refuses an unknown kind", () => {
    const r = parseNewProject({ orgId, name: "Api", environment: { ...environment, kind: "prod" }, tags: ["x"], description: "d" }, "x25519");
    expect(r).toMatchObject({ ok: true, value: { environment: { kind: "prod" }, details: { tags: ["x"], description: "d" } } });
    expect(parseNewEnvironment({ ...environment, kind: "qa" }, "x25519").ok).toBe(false);
    expect(parseNewProject({ orgId, name: "Api", environment, tags: ["Bad Tag"] }, "x25519").ok).toBe(false);
    expect(parseNewProject({ orgId, name: "Api", environment, owner: "x" }, "x25519").ok).toBe(false);
  });
});
