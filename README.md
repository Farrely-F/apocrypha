# Apocrypha

End-to-end encrypted environment-secret store for developers. Secrets are sealed in your browser before they leave it; the server only ever stores ciphertext. Named for Hermaeus Mora, keeper of forbidden knowledge.

> **Status: pre-release, unaudited.** The cryptography in `src/lib/crypto` has not been reviewed by a third party. Do not store secrets you cannot afford to lose or leak. See [`docs/DESIGN.md`](docs/DESIGN.md) for the threat model and the 16 design decisions.

## How it works

- **Two layers.** GitHub sign-in proves who you are; a separate **vault passphrase** (Argon2id) unlocks your keys. Forget it and the **recovery key** shown once at setup is the only way back. The server cannot reset it.
- **One key per environment.** Each environment (`staging`, `production`, ...) has its own AES-256-GCM key, wrapped to each member's public key.
- **Encrypted names and values.** Secret names and values are sealed with per-version subkeys bound to the environment, secret and version. History is append-only.
- **Auto-lock.** The unlocked key is non-extractable and held in IndexedDB; it locks after 15 minutes idle.

## Run it

```bash
cp .env.example .env.local   # fill in DATABASE_URL, BETTER_AUTH_SECRET, GitHub OAuth
npm install
npm run db:migrate           # or `npm run db:reset` to wipe the local SQLite file
npm run dev
```

GitHub OAuth callback: `http://localhost:3000/api/auth/callback/github`.

`DATABASE_URL` is either a Turso URL (`libsql://...`) or a local file (`file:./data/apocrypha.db`) for self-hosting.

For local testing without GitHub, set `APOCRYPHA_TEST_AUTH=1` (ignored in production) to enable a dev email/password form on the sign-in page.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (crypto, authorization, validation) |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:reset` | Delete the local SQLite file and re-migrate |

## What works today

Personal workspace, projects and environments, add / edit / delete / import / export secrets, version history with diff and restore, bulk actions.

## Not built yet

Organizations and member roles, invites, share links, audit log, member removal with key rotation, recovery flow UI, CLI. Tracked in the GitHub issues.

## Security headers

`next.config.ts` sets a CSP (same-origin only, no framing), `nosniff`, `no-referrer` and a locked-down permissions policy. The CSP still allows inline scripts because Next injects them; nonces are a follow-up.

## License

TBD.
