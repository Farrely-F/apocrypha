# Self-hosting Apocrypha

Apocrypha runs as one container with one SQLite (libSQL) file on a volume. There is nothing hosted-only in the core path: no Vercel APIs, no external database, no third-party service except the sign-in provider you choose.

> **Pre-release and unaudited.** The cryptography has not been reviewed by a third party. Read [`DESIGN.md`](DESIGN.md) for what the server can and cannot see before you put anything real in it.

## What you need

- Docker with Compose.
- A public **HTTPS** URL in front of the container (Caddy, nginx, Traefik, a cloud load balancer). Browsers only allow the crypto APIs Apocrypha uses on `https://` pages (and `localhost`), so plain `http://` on a real hostname will not work.
- A GitHub OAuth app for sign-in (<https://github.com/settings/developers>). Callback URL: `<your URL>/api/auth/callback/github`.

## Start

```bash
cp .env.example .env
# edit .env: set BETTER_AUTH_SECRET (openssl rand -base64 32), BETTER_AUTH_URL (your public https URL),
# GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
docker compose up -d
```

The first start creates the database on the `apocrypha-data` volume and applies every migration. Open `BETTER_AUTH_URL`, sign in with GitHub, and create your vault.

Check that it is healthy: `curl http://localhost:3000/api/health` returns `{"ok":true}`, and `docker compose ps` shows `healthy`.

## Configuration

Everything is an environment variable.

| Variable | Required | Meaning |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | Signs sessions. Long and random. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | yes | The public URL users open, with no trailing slash. Used for OAuth callbacks and origin checks, and (set at build time, which `docker compose` does) for the landing page's canonical, share-preview and sitemap URLs. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | for GitHub sign-in | OAuth app credentials. |
| `DATABASE_URL` | no | Defaults to `file:/data/apocrypha.db` in the container. A `libsql://` Turso URL also works (then set `DATABASE_AUTH_TOKEN`). |
| `AUDIT_RETENTION_DAYS` | no | How long audit events are kept. Default 180. |
| `TRUSTED_PROXY_HOPS` | no | How many reverse proxies sit in front of the container. Default 1. Used to find the client address for rate limits: set `0` if you are not behind a proxy that sets `X-Forwarded-For`. |

Email sign-in (magic links, SMTP) is **not built yet** (see issue #5). Sign-in is GitHub only for now.

## Backups

The database holds ciphertext only (wrapped keys, sealed secrets), but it is everyone's data, so treat backups like the live database.

Online backup, while the app keeps running (a consistent snapshot, not a raw file copy):

```bash
docker compose exec apocrypha node scripts/backup.mjs /data/backups/apocrypha-$(date +%F).db
```

It refuses to overwrite an existing file. The file lands on the volume; copy it off the host:

```bash
docker compose cp apocrypha:/data/backups ./backups
```

To restore: stop the app, put the backup in place as `apocrypha.db` on the volume, start it again.

```bash
docker compose down
docker run --rm -v apocrypha_apocrypha-data:/data -v "$PWD/backups:/backups" debian:bookworm-slim \
  sh -c 'cp /backups/apocrypha-2026-10-21.db /data/apocrypha.db && rm -f /data/apocrypha.db-wal /data/apocrypha.db-shm'
docker compose up -d
```

(The volume is named `<project>_apocrypha-data`; `docker volume ls` shows yours.)

Back up your `.env` too, separately. Losing `BETTER_AUTH_SECRET` only signs people out, but you will want the GitHub credentials.

**Your users' passphrases and recovery keys are not in the database and cannot be recovered by you.** That is by design.

## Upgrade

1. Take a backup (above).
2. Pull or build the new version: `git pull && docker compose build`.
3. `docker compose up -d`.

Migrations run on every start and skip anything already applied. If a migration fails the container stops instead of serving an app that does not match its database; the logs say why, and your backup is untouched. Roll back by restoring the backup and starting the previous image.

## Running behind a proxy

The container listens on port 3000 over plain HTTP. Terminate TLS in front of it and pass the usual headers. Caddy example:

```
apocrypha.example.com {
    reverse_proxy localhost:3000
}
```

Keep `BETTER_AUTH_URL` equal to the public address, otherwise sign-in and same-origin checks will refuse requests.

## Security notes

- The server never sees passphrases, recovery keys, private keys, environment keys or secret values. It stores ciphertext, wrapped keys and metadata (org, project and environment names, who is a member, and the audit log).
- Share links and invite links carry their key in the URL after the `#`, which browsers never send. Do not put a reverse proxy in front that logs or rewrites fragments (none can; they never receive them).
- The container runs as a non-root user and sets a strict Content-Security-Policy and other security headers.
- Rate limits are stored in the database, so they hold across restarts.

## Without Docker

```bash
npm ci
npm run build
npm run db:migrate
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

Set the same environment variables. (`npm run start` is not the right command for a standalone build.)
