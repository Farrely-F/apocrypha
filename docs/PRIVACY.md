# Personal data in Apocrypha

For people who **run** an Apocrypha server. This is an engineering description of what the software stores and what its erase and export features do. It is **not legal advice**, and it does not make an installation "compliant" with anything: whoever runs the server is the data controller (in Indonesian terms, *pengendali data pribadi*) and carries the legal duties. Have a lawyer check what Indonesia's Personal Data Protection Law (Law No. 27 of 2022, "UU PDP") and its implementing regulations require of you, including how fast you must answer a request and when you must report a breach.

## What is stored about a person

| Data | Where | Why | Erased by "Erase account" |
| --- | --- | --- | --- |
| Name, email, avatar URL, created/updated time | `user` | Identity, shown to teammates | Yes |
| Linked sign-in methods and the provider's access/refresh tokens | `account` | Signing in with GitHub or Google | Yes |
| Sessions: user agent, IP address, times | `session` | Keeping you signed in; the devices list | Yes |
| Authenticator secret and backup codes (encrypted with `BETTER_AUTH_SECRET`) | `two_factor` | Two-step sign-in | Yes |
| Project descriptions, tags and links, and environment types, as you type them | `project`, `environment` | Context for your team. Stored in plaintext like names, so keep secrets out | Yes (with the project, or your organisation) |
| Vault public key, passphrase-wrapped private key, recovery-wrapped private key | `vault` | Opening your vault in a browser. We cannot read the wrapped keys | Yes |
| Organisation memberships and roles | `member` | Access control | Yes |
| Environment keys wrapped to you, write flags, re-share requests | `environment_key_grant`, `environment_write`, `regrant_request` | Access to environments | Yes |
| Share links and unused invites you created | `share`, `invite` (+ `invite_grant`) | They carry key material for an organisation | Yes (deleted) |
| Invites addressed to your email | `invite.email` | Email-bound invites | Unused ones deleted; the address is blanked on used ones |
| Sign-in tokens (magic links, trusted browser, pending two-factor, OAuth link requests) | `verification` | Sign-in flows | Yes |
| Rate-limit counters keyed by your id | `rate_limit` | Abuse protection | Yes |
| If you are the system administrator: an opaque id in the access log | `system_access_log` | Accountability for looking at other people's metadata | Kept for the retention window; it is an id, not an identity |
| Every organisation you are the **only member** of, with its projects, environments, secrets and versions, invites, share links and audit log | many | It is yours alone | Yes (deleted with you) |
| Secrets you wrote in an organisation that continues | `secret`, `secret_version` | They belong to the organisation | **Kept**, with your id as an opaque author reference |
| Audit events where you acted or were the target, in organisations that continue | `audit_event` | Security record | **Kept**, with your id as an opaque reference |

The dashboard's charts and counts are computed on request from rows the server already holds (counts, dates, the audit log a person may read); nothing is collected for them, nothing is stored, and nothing is sent to anyone. They follow the same visibility rules as the rest of the app: a person is counted only into environments whose key they hold, and sees the audit entries they are allowed to see. The secrets themselves are never opened for this.

The app itself sets no analytics or advertising cookies and loads no third-party scripts. Cookies are the session, the two-factor challenge and the "don't ask for a code on this browser" marker, all first-party. Fonts are served by Next from the same origin.

## The system administrator

The operator of a deployment can name themselves in `SYSTEM_ADMIN_EMAILS` and open `/admin`, outside the vault, to see how the service is used and whether it is healthy. It is read-only and built to be the least that does that job:

- **Who.** A verified email in the environment variable, checked on every request (nothing is stored that could go stale or be edited), with a sign-in from the last hour. If no one is listed, or `SYSTEM_ADMIN_ENABLED` is off, `/admin` answers exactly as an unknown path does, status included, decided in the proxy before anything is sent. Two-step sign-in is encouraged with a plain warning, not required.
- **What it shows.** Counts and dates for the whole service (people, organisations, projects, environments, live secrets, sign-ups per day, active people, audit events per day by kind, share links and invites in flight, table sizes), live health (database answering, migrations in step, size, build), and a **people list** with a masked address (`a•••••@gmail.com`), joined date, last active (to the day), two-step on or off, sign-in methods, organisation count, secrets created and whether a vault exists.
- **What it never shows.** Names, IP addresses, user agents, organisation, project or environment names, member lists, or the contents of any audit log. Secrets and keys are ciphertext and are not opened.
- **Full addresses.** Only by clicking Show on a row, or by looking up a full address you already have (an exact match; no prefix or substring search, so it cannot be used to browse). Both are recorded.
- **The access log.** Every page the administrator opens, every address shown and every lookup is written to `system_access_log` (time, the administrator's opaque id, a fixed action name, the opaque id of the account involved; never an address) and removed after `SYSTEM_ACCESS_LOG_DAYS` (default 180). The writer refuses anything that is not an opaque id. If the log cannot be written, an address is not shown. The administrator can read it on the page.
- **Server logs.** The app writes one JSON line per event with a fixed set of fields. User ids, emails, IPs, bodies and URLs with ids are not in them; text is scrubbed of anything shaped like an email, token, cookie or sealed blob. The only identifier allowed is the administrator's own opaque id on `admin.*` events. Uncaught errors are logged by route template and error class, never by message.
- **Saved numbers.** The system-wide counts are reused for five minutes from one row in `system_snapshot` (counts and dates only, no person in it), so they cost the same on a serverless host as on one server. Refresh deletes it.
- **Your basis.** This is the operator looking at their own service to run, secure and size it, which is likely to rest on legitimate interest under the EU's rules and to fall within the stated purpose under Indonesia's PDP law. That is for you to state in your own privacy notice, and for a lawyer to confirm.

## Rights and where they live in the app

| Right | In the app |
| --- | --- |
| Get a copy of your data | **Settings → Your data → Download my data** (`GET /api/account/export`, JSON) |
| Correct your data | **Settings → Profile** for your name. Your email comes from your provider: change it there and sign in again |
| Erase your data and end processing | **Settings → Erase account** (`DELETE /api/account`) |
| Withdraw consent | Same as erasure; you can also unlink a provider or turn off two-step sign-in in Settings |
| Take your secrets with you | Each environment's page can export `.env` or JSON |

The export leaves out other people's details, key material (wrapped keys, two-factor secret, tokens) and secrets themselves, which the server only holds as ciphertext.

## How erasure behaves

1. **Preview.** The dialog asks the server what will happen to each organisation: *deleted with you* (you are the only member), *you leave* (others remain and another owner exists) or *blocked*.
2. **Blocked.** If you are the **only owner** of an organisation that still has other members, nothing is erased. Make someone else an owner (Organisation settings → Members → Role → Owner) or delete the organisation. This stops one person's erasure from stranding a team.
3. **Confirmation.** A sign-in from the last 15 minutes, and the account email typed back. The endpoint is rate-limited.
4. **One transaction.** The server re-checks everything inside a single database transaction, so a change of ownership between the preview and the click cannot slip through; either all of it is erased or none of it is.
5. **Afterwards** the session cookie is cleared, the unlocked key is removed from the browser, and the person lands on `/goodbye`. Keys left in *other* browsers stay there until they lock, but they open nothing: the ciphertext and the grants are gone.

### What is kept, and why

- **Audit log.** Each organisation's log is a chain of hashes, so a row cannot be edited without breaking verification for everyone else. Rows hold only ids, never names, emails or secret values, and once the account is erased the id points at nobody. Organisations that continue keep these entries as a security record.
- **Secret authorship.** `created_by` on secret versions and invites is the same kind of opaque id.
- **Teammates keep what you could read.** Erasing your account does not rotate environment keys, and you may hold copies of secrets you opened. Owners should rotate anything sensitive at its source. (Removing a member through Members does rotate keys; erasing yourself does not, because the key rotation needs an owner's unlocked vault.)

### Backups

`scripts/backup.mjs` snapshots the whole database. A snapshot taken before an erasure still contains the erased data, and restoring one brings it back. Decide a retention period for backups, delete old ones on that schedule, and after any restore re-run the erasure requests received since the snapshot.

### Things outside this app

- **GitHub and Google** keep their own records and the authorisation they gave Apocrypha. Revoke the app in their account settings.
- **Requests made outside the app** (an email from someone who cannot sign in): there is no operator console for erasing an account. Verify the person, then ask them to use Settings, or erase the rows by hand in the order `eraseAccount` in `src/lib/account/erase.ts` follows, in a transaction.

## For the operator

Things the software cannot do for you, to check with counsel: a privacy notice shown to users; the lawful basis you rely on; whether you must appoint a data protection officer; records of processing; how long you retain audit logs (`AUDIT_RETENTION_DAYS`, default 180) and backups; breach notification to affected people and to the authority; and cross-border transfer rules if the server or the database host is outside Indonesia.
