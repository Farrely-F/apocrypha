# Apocrypha — Design

> Status: agreed design, pre-implementation. Crypto is **unaudited** until an independent review says otherwise.

Apocrypha is an account-based, end-to-end encrypted secret store for `.env` files, built around orgs so a developer can keep their own secrets in sync and share them with other devs. The server stores only ciphertext. A person can belong to many orgs.

Name: Hermaeus Mora's Apocrypha (Skyrim), the endless library of forbidden knowledge.

## 1. Scope

**v1 (web only):** E2EE vault, orgs/projects/environments, per-secret versioned storage, invites, fixed roles with per-environment grants, key rotation on removal, hash-chained audit log, ephemeral share links, Mora-themed UI.

**Deferred:** CLI (npm), service/CI tokens, custom-role editor, groups/teams, passkey login and PRF unlock, signed audit events, per-write signatures, enterprise SSO (SAML/OIDC), file attachments, effect.ts.

## 2. Trust model (Q1)

End-to-end encrypted ("zero-knowledge" in the colloquial sense; no ZK proofs are used). The server never sees plaintext secret names or values. Decryption happens only in the browser.

**Known limits, stated plainly:**
- The server delivers the JavaScript that decrypts. A compromised server could ship malicious JS. Mitigations: strict CSP, no third-party scripts, SRI, open source. A verifiable client (CLI/extension) comes later.
- Removing a member cannot un-leak what they already saw. The real fix is rotating the secrets at the source.
- Write permission is a server ACL. A reader holds the environment key and could produce valid ciphertext; a compromised server could accept it. Per-write signing is deferred.
- The server cannot log "user viewed plaintext X", only "user fetched ciphertext for env Y".
- Losing both the vault passphrase and the recovery key loses private (solo) data permanently.

## 3. Identity vs. vault (Q2, Q14)

Two layers.

- **Identity** (Better Auth): GitHub OAuth, Google OAuth, email magic link. No identity password. Gates API access and org membership.
  - Email must be verified before an invite can be redeemed; OAuth emails count only if the provider marks them verified.
  - Same verified email across providers links to one account; an unverified match never auto-links.
  - Sessions: `HttpOnly`, `Secure`, `SameSite=Lax`, rotating; device list and "sign out everywhere".
- **Vault:** a separate **vault passphrase**. Argon2id derives a key that wraps the user's private key; the server stores only the wrapped blob. A one-time **recovery key** is a second wrapping of the same private key.
- Signup sequence: identity login → create vault (passphrase, keypair, recovery key shown once, confirmation required). No app screen is reachable until done.
- Lost passphrase + org membership: user resets to a fresh keypair and an admin who still has access re-wraps the environment keys to the new public key. Solo-only data is unrecoverable without the recovery key.

## 4. Hierarchy and keys (Q3)

```
Org → Project → Environment (dev / staging / prod …) → Secrets
```

- A personal vault is a one-member org.
- **One symmetric key per environment**, wrapped to each principal allowed in it: `environment_key_grant(env_id, principal_id, key_version, wrapped_key)`.
- Grants reference a generic **principal** (user now; device/machine later).
- Org, project and environment **names are plaintext**.

## 5. Secret storage (Q10)

One row per secret, append-only versions.

- Each version has an encrypted `name` and encrypted `value` (and encrypted free-text metadata). Deleting writes a tombstone.
- Encryption: AES-256-GCM under a per-version subkey (HKDF from the environment key). AAD binds `env_id`, `secret_id`, `version`, `key_version`, so ciphertexts can't be swapped or replayed.
- Writes carry the expected version; a stale editor gets a conflict, not a silent overwrite.
- The client decrypts everything for an environment and filters/sorts locally. No server-side search.
- Paste/upload `.env` is parsed client-side; each entry becomes a version. Export as `.env`, JSON, or copy.
- Values are strings, multi-line allowed, 64 KB cap.
- Server-visible: org/project/env existence and names, member lists and roles, version counts, timestamps, authors.

## 6. Roles and grants (Q8)

- Org roles (server-enforced), seeded fixed set: `owner`, `admin`, `member`. Implemented with Better Auth's organization plugin access control so custom roles can be added later; no custom-role UI in v1.
- Environment grants: `none` / `read` / `write`. Read = holds the key (cryptographic). Write = server ACL.
- An admin can only grant access to environments they can already decrypt. Admin is not a back door.
- There is always at least one owner; ownership transfer is explicit.

## 7. Invites (Q6)

Fragment-key invite.

1. Admin's browser generates an ephemeral keypair, wraps the selected environment keys to it, uploads the blob.
2. Link: `https://…/join/<id>#<ephemeral private key>`. The fragment never reaches the server.
3. Recipient signs in (email verified), unwraps locally, re-wraps to their permanent public key, uploads. Invite is burned.

Defaults: expires 48h, single use, bound to invitee email when provided. Revocable while pending. Member page shows a key fingerprint for optional verification.

## 8. Removal and rotation (Q11)

- Key versions per environment. Every secret version records its key version.
- Removing a member (or downgrading `read` → `none` on an environment) creates key version N+1 wrapped only to remaining principals and deletes the removed member's grants. New writes use N+1; remaining members keep grants for older versions so history stays readable.
- Removal is performed by an unlocked admin's browser. If no admin is unlocked, removal is blocked, not deferred.
- `write` → `read` does not rotate.
- UI shows "N secrets were readable by <person>; rotate these at the source". Optional admin-triggered full re-encrypt as a background job.

## 9. Share links (Q7)

For non-members. A snapshot of one secret or an environment's current values, taken at creation.

- Key = KDF(fragment secret ‖ optional password). Link `…/s/<id>#<fragment>`; password optional.
- Defaults: expires 24h, 1 view (burn after read), adjustable up to N views, revocable.
- Owner sees metadata (created, viewed, expired), never content.

## 10. Audit log (Q13)

- Append-only, per-org **hash chain** (each entry includes the previous hash). Owners can export JSON with the head hash.
- Logged: auth/unlock events, membership and role/grant changes, rotations, secret version writes/deletes/reverts, environment ciphertext fetch (once per session per env), share lifecycle. Records reference secret ids only; admins' browsers decrypt names for display.
- Visibility: `owner`/`admin` see the org log; `member` sees events on environments they hold plus their own account events.
- Retention: 180 days hosted, configurable self-hosted.

## 11. Browser key handling (Q5)

- After unlock, the private key is imported as a **non-extractable `CryptoKey`** in IndexedDB.
- Auto-lock after 15 min idle; explicit lock button; "trust this device for N days" off by default; locked state always visible.

## 12. Crypto (Q15)

- WebCrypto for everything: ECDH (X25519 where supported, P-256 fallback), AES-256-GCM, HKDF-SHA-256.
- Argon2id via a small audited WASM library for the passphrase KDF only. Params start at 64 MiB, t=3, p=1, stored per user so they can be raised.
- Wrapping: ECDH → HKDF → AES-GCM (HPKE-shaped). No novel constructions. Every blob is versioned (`v1|alg|…`).
- Lives in `src/lib/crypto/`, imports nothing from React or Next, runs under Node's `webcrypto` too.
- Written protocol spec in `docs/crypto.md` with known-answer vectors; tamper/swap tests must fail. README says "unaudited" until independent review.

## 13. Stack and hosting (Q9)

- Next.js App Router (current app), Tailwind v4, shadcn (behavior only, restyled).
- Drizzle ORM over libSQL: Turso (`libsql://…`) hosted, `file:/data/apocrypha.db` self-hosted. Same schema and migrations; no Vercel-only APIs in the core.
- Better Auth + Drizzle adapter. Mutations via Server Actions / route handlers; React Query only for client-side cached reads. No effect.ts in v1.
- Email: Resend by default; SMTP for self-hosters.
- Single Next app (no monorepo yet). Extract `src/lib/crypto` into a package when the CLI starts.
- Tests: Vitest for crypto first; Playwright for the tracer bullet later.

## 14. UI direction (Q12)

Terminal-native, Mora's world. Not generic shadcn.

- **Palette:** abyssal near-black, bile/teal-green signal color, aged-bone text, dry blood-red for destructive only. No gradients across unrelated hues, nothing purple.
- **Shape:** 0 radius, 1px hairlines, no shadows, no cards-in-cards; panes with box-drawing dividers.
- **Type:** Geist Mono as the working face (drop Inter); one archaic display face for wordmark and section titles only.
- **Motion:** glitch marks state change (decrypt scramble, lock static, single error flicker), not wallpaper.
- **Interaction:** keyboard-first, `⌘K` command palette, status bar (org, env, lock state, key version).
- **Effects placement:** FaultyTerminal/Dither on landing and unlock; low-opacity GradientASCII/Dither only in chrome and empty states; none on secret lists/editors. Pause WebGL when hidden; honor `prefers-reduced-motion`.

## 15. Build order (Q16)

**Milestone 1 (tracer bullet):** GitHub sign-in → create vault (passphrase, keypair, recovery key) → auto personal org/project/env → add one secret → reload → locked → unlock → read it back.

Then:
1. Theme and shell (shadcn restyle, fonts, palette, gate/unlock screen, status bar).
2. Secrets proper (versions, history/diff, `.env` import/export, concurrency, reveal/copy).
3. Orgs and invites (multi-org, fragment invites, fixed roles, grants).
4. Removal and rotation (key versions, lazy rotation, rotate-at-source checklist, optional re-encrypt).
5. Audit log (hash chain, visibility, export).
6. Share links.
7. Hardening (CSP/SRI, rate limits on auth and unlock, session/device management, `docs/crypto.md`, threat model, "unaudited" README).
8. Deferred list (section 1).

Crypto tests are written first.
