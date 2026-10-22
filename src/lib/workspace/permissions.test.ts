import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions";
import { BUILDERS } from "./roles";

const grant = (id: string) => PERMISSIONS.find((p) => p.id === id)!.grants;

describe("permission table", () => {
  it("has unique rows and a verdict for every role", () => {
    expect(new Set(PERMISSIONS.map((p) => p.id)).size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) expect(Object.keys(p.grants).sort()).toEqual(["admin", "member", "owner"]);
  });

  it("is drawn from the lists the server enforces", () => {
    // building, inviting, sharing and access control all use BUILDERS
    for (const id of ["structure.build", "people.invite", "people.access", "people.regrant", "secrets.share"]) {
      expect(Object.entries(grant(id)).filter(([, g]) => g === "yes").map(([r]) => r).sort()).toEqual([...BUILDERS].sort());
    }
  });

  it("keeps the owner-only powers owner-only, and a member from administering anything", () => {
    for (const id of ["people.roles", "structure.org", "record.verify"]) {
      expect(grant(id)).toEqual({ owner: "yes", admin: "no", member: "no" });
    }
    for (const p of PERMISSIONS.filter((p) => p.group !== "Secrets" && p.id !== "record.audit")) expect(p.grants.member).toBe("no");
  });
});
