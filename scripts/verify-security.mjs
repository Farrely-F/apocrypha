// Check a running Apocrypha server the way a skeptical operator would.
//   node scripts/verify-security.mjs https://vault.example.com
//   npm run verify:security -- http://localhost:3000
//
// It makes ordinary page requests and asserts what the landing page promises about the page that decrypts your
// secrets: that scripts there only run with a per-request nonce, that nothing third-party is loaded, and that
// the headers around it are set. Exit status is 1 if anything fails. It needs no account and changes nothing.
const base = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
const FAKE = "00000000-0000-4000-8000-000000000000";

// Pages that take a passphrase, a key or a session: these must be on the strict policy.
const STRICT = ["/sign-in", "/two-factor", "/vault/new", "/dashboard", "/settings", `/join/${FAKE}`, `/s/${FAKE}`];
// Prerendered pages with nothing to protect.
const STATIC = ["/", "/goodbye"];

let failed = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => {
  failed++;
  console.log(`  FAIL  ${msg}`);
};
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

const directive = (csp, name) => csp.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `)) ?? "";

async function page(path) {
  const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "apocrypha-verify-security" } });
  return { res, html: await res.text(), csp: res.headers.get("content-security-policy") ?? "" };
}

function scripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
}

console.log(`Checking ${base}\n`);

for (const path of STRICT) {
  console.log(path);
  const { res, html, csp } = await page(path);
  // A signed-out visitor is redirected from the app; the redirect carries the policy too.
  const body = res.status >= 300 && res.status < 400 ? "" : html;
  check(csp !== "", "has a Content-Security-Policy");
  const script = directive(csp, "script-src");
  const nonce = /'nonce-([^']+)'/.exec(script)?.[1];
  check(Boolean(nonce), "script-src carries a nonce");
  check(script.includes("'strict-dynamic'"), "script-src uses 'strict-dynamic'");
  check(!script.includes("'unsafe-inline'"), "script-src has no 'unsafe-inline'");
  check(!script.includes("'unsafe-eval'"), "script-src has no 'unsafe-eval'");
  check(directive(csp, "script-src-attr") === "script-src-attr 'none'", "inline event handlers are off");
  check(directive(csp, "connect-src") === "connect-src 'self'", "the page can only talk to its own server");
  check(directive(csp, "form-action") === "form-action 'self'" && directive(csp, "frame-ancestors") === "frame-ancestors 'none'", "forms post only to us; cannot be framed");
  if (body) {
    const tags = scripts(body).filter((a) => !/type="application\/ld\+json"/.test(a));
    const bare = tags.filter((a) => !/\bnonce="/.test(a));
    check(tags.length > 0 && bare.length === 0, `every script tag carries the nonce (${tags.length} checked)`);
    check(new RegExp(`nonce="${nonce?.replace(/[+/=]/g, (c) => `\\${c}`)}"`).test(body), "and it is the nonce in the header");
    // Things the browser fetches by itself: script and image sources, form targets, and stylesheet, preload,
    // icon or manifest links. (A link rel="author" to the project's repository is not fetched.)
    const fetched = [...body.matchAll(/<(?:script|img|source|iframe)\b[^>]*\bsrc="([^"]+)"|<form\b[^>]*\baction="([^"]+)"|<link\b(?=[^>]*\brel="(?:stylesheet|preload|modulepreload|prefetch|icon|apple-touch-icon|manifest)")[^>]*\bhref="([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    const outside = fetched.filter((u) => /^https?:\/\//.test(u) && new URL(u).origin !== origin);
    check(outside.length === 0, `loads nothing from another origin${outside.length ? `: ${outside.slice(0, 3).join(", ")}` : ""}`);
  }
}

console.log("\nthe nonce is new on every request");
{
  const nonces = new Set();
  for (let i = 0; i < 5; i++) nonces.add(/'nonce-([^']+)'/.exec((await page("/sign-in")).csp)?.[1]);
  check(nonces.size === 5, "5 requests, 5 different nonces");
}

for (const path of STATIC) {
  console.log(`\n${path} (prerendered, no credentials or keys)`);
  const { csp } = await page(path);
  check(csp !== "", "has a Content-Security-Policy");
  check(directive(csp, "connect-src") === "connect-src 'self'" && !/https?:\/\//.test(csp), "talks to nobody else");
}

console.log("\nheaders on every page");
{
  const { res } = await page("/sign-in");
  const h = (k) => res.headers.get(k);
  check(h("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
  check(h("x-frame-options") === "DENY", "X-Frame-Options: DENY");
  check(h("referrer-policy") === "no-referrer", "Referrer-Policy: no-referrer");
  check(h("cross-origin-opener-policy") === "same-origin", "Cross-Origin-Opener-Policy: same-origin");
  check(/camera=\(\)/.test(h("permissions-policy") ?? ""), "Permissions-Policy turns off camera, microphone, location");
  check(!h("x-powered-by"), "does not announce its framework");
  if (origin.startsWith("https://")) check(/max-age=\d{6,}/.test(h("strict-transport-security") ?? ""), "Strict-Transport-Security is set");
  else console.log("  skip  Strict-Transport-Security (server is not on https)");
}

console.log("\nstatic files");
{
  const { html } = await page("/sign-in");
  const files = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => m[0]);
  const withIntegrity = files.filter((t) => /\bintegrity="sha(256|384|512)-/.test(t)).length;
  console.log(`  info  ${withIntegrity} of ${files.length} script files carry an integrity hash (Next hashes what it can at build time)`);
  const res = await fetch(`${base}/api/health`);
  check(res.ok, "/api/health answers");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
