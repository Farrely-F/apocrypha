import { describe, expect, it } from "vitest";
import { readJsonLimited } from "./body";

const req = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://x.test/", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("readJsonLimited", () => {
  it("parses a body under the limit", async () => {
    expect(await readJsonLimited(req('{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
  });
  it("refuses a body over the limit even when Content-Length is missing or lies", async () => {
    const big = JSON.stringify({ x: "y".repeat(500) });
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const chunked = await readJsonLimited(req(stream), 100);
    expect(chunked).toMatchObject({ ok: false, status: 413 });
    const lying = await readJsonLimited(req(big, { "content-length": "5" }), 100);
    expect(lying).toMatchObject({ ok: false, status: 413 });
  });
  it("says 400 for bad JSON", async () => {
    expect(await readJsonLimited(req("{nope"), 100)).toMatchObject({ ok: false, status: 400 });
  });
});
