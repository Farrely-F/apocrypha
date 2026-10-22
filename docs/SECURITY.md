# Security: what is enforced, and how to check it

Apocrypha's promise is that the server only stores ciphertext. The part of that promise a server operator could break is the page itself: it is served by the server and it is the code that handles your passphrase. This document says what stands between a hostile script and your passphrase, what does not, and how to check each claim yourself.

The crypto has **not** been independently reviewed. Do not store anything you cannot rotate.

## The page that decrypts

### Content Security Policy

Every page gets a policy from `src/proxy.ts`, built in `src/lib/security/csp.ts`.

**Strict, per-request nonce.** The pages that take a passphrase, a key or a session (`/sign-in`, `/two-factor`, `/vault/*`, `/dashboard`, `/settings`, `/o/*`, `/join/*`, `/s/*`):

- `script-src 'self' 'nonce-<random per request>' 'strict-dynamic' 'wasm-unsafe-eval'`. A script runs only if it carries this request's nonce or was loaded by one that does. There is no `'unsafe-inline'` and no `'unsafe-eval'`. (`'wasm-unsafe-eval'` is for Argon2id and does not allow `eval()`.)
- `script-src-attr 'none'`: no inline event handlers.
- `style-src 'self' 'nonce-…'` plus `style-src-attr 'unsafe-inline'`: stylesheets are files, and style attributes cannot run code.
- `connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`: the page can talk only to its own server, cannot post a form elsewhere, and cannot be framed.
- No third-party origin appears anywhere in the policy.

These routes are rendered per request (their layouts call `connection()`), because a prerendered page cannot carry a per-request nonce.

**Prerendered pages** (the landing page, the goodbye page): their inline bootstrap scripts are fixed at build time, so they keep `'unsafe-inline'`. They hold no credentials or keys. A test fails if a route is added without being put on one side or the other.

**From a prerendered page into the app.** A policy belongs to the document, and a client-side navigation reuses the document. So a link from the landing page (relaxed) to the unlock screen would keep the relaxed policy. `PolicyBoundary` (mounted in the root layout) turns any such link into a full page load, which gets the strict policy; inside the app, and from the app to the landing page, navigation stays client-side. Because it listens at the document, a link added to a public page later is covered too.

### What this does and does not do

It stops script that someone injects into a page (a cross-site-scripting bug, a hostile browser extension's inline script, a tampered third-party include) from running, and from sending anything to another origin if it did. It does **not** stop a compromised server, or a compromised dependency in the build, from shipping a page with its own valid nonce. Open source and reproducible builds help there; they do not remove the risk. That is why the landing page says so.

### Subresource integrity

`experimental.sri` is on: Next adds an `integrity` hash to the script and stylesheet files it can hash at build time. With Turbopack this covers the main bundle files and not every lazily loaded chunk, so treat it as a second layer, not the guarantee. `npm run verify:security` reports how many script files carry one.

### Other headers

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy` that turns off camera, microphone, geolocation and payment, no `X-Powered-By`, and `Strict-Transport-Security` when `BETTER_AUTH_URL` is `https://`. (`next.config.ts`.)

## Rate limits

| Where | Limit | Key |
| --- | --- | --- |
| Second-factor code and backup-code checks | 10 / minute | client address |
| Sign-in, sign-up, password reset | 20 / minute | client address |
| Provider sign-in callback | 30 / minute | client address |
| Link, unlink, 2FA changes, profile | 30 / minute | client address |
| Any other state-changing auth request | 240 / minute | client address |
| Writes through the API (secrets, projects, members, organisations) | 300 / minute | signed-in user |
| Passphrase change, vault reset, recovery blob | 10, 5, 20 / hour | signed-in user |
| Erasing an account, deleting an organisation | 5, 10 / hour | signed-in user |
| Creating invites, share links | 30, 60 / hour | signed-in user |
| Redeeming an invite, opening a share link | 20 / minute, 30 / minute | user or address |

Counters live in the database (`rate_limit`), so they survive restarts. The client address is the one **your** reverse proxy appended to `X-Forwarded-For`, counted in from the right by `TRUSTED_PROXY_HOPS` (default 1), because a client can write anything at the front of that header. With `TRUSTED_PROXY_HOPS=0` there is no trusted address, and per-address limits are skipped rather than lumping everyone together. The two-factor plugin also locks an account after repeated wrong codes.

## Verify it yourself

Run these against a production build (a dev server relaxes the policy on purpose).

```bash
npm test                                   # includes src/lib/security/*.test.ts
npm run verify:security -- https://your-server    # checks a running server
```

`verify:security` needs no account and changes nothing. For each strict page it asserts the policy above, that **every** script tag carries the nonce in the header, that the nonce is different on every request, that nothing is loaded from another origin, and that the headers are present. It exits non-zero on any failure.

### The four limits on the landing page, and what checks each

1. **"Not independently audited. The crypto is checked against published test vectors and has had a review by an AI assistant, which is not an outside audit."**
   `claims.test.ts` checks the notice is in the README, the landing page and the sign-in page, that the known-answer tests cite RFC 7748, RFC 5869, the GCM specification and the Argon2 reference, that `docs/crypto-review.md` exists and says it is not an audit, and that the limits it lists are pinned by tests (`crypto/limits.test.ts`). Run `npm test -- kat` to see the vectors pass.
2. **"We serve the code that decrypts. A compromised server could ship a page that steals your passphrase. A strict CSP and open source shrink that risk. They don't remove it."**
   `csp.test.ts` and `claims.test.ts` check the policy and that every page taking a passphrase is on it; `verify:security` checks the same on a live server. The caveat is itself tested, so it cannot be dropped quietly.
3. **"Removing someone doesn't make them forget. Rotate the secrets themselves at their source. We'll list which ones the person could read."**
   `claims.test.ts` checks that the removal plan lists exactly the environments the person could open, and that afterwards they hold no key and the new key version is never given to them. The rotation rules are in `members/store.test.ts`. The list of secret names in the confirmation is built in the browser from what you can open.
4. **"Lose the passphrase and the recovery key, lose the data. Nobody can recover a personal vault for you, including us."**
   `claims.test.ts` checks that the vault table holds a public key and two wrapped blobs and nothing else, that the browser-side key code reads no server secret, and that a vault does not open with a wrong passphrase, the server's own secret, another vault's recovery key, or an all-zero recovery key.

## Reporting a problem

Please open a private security advisory on the repository rather than a public issue.
