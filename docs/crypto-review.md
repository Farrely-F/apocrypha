# Crypto review notes

**This is a self-review, not an audit.** It was done on 22 October 2026 by an AI assistant (Claude) reading the code, the same kind of tool that helped write much of it. It shares that tool's blind spots, no cryptographer was involved, and it is not independent. It is here so that what has been looked at, what was found and what was not looked at are written down. An independent review by a person who does this for a living is still needed before anyone relies on this for something they cannot rotate.

## What was read

`src/lib/crypto/*` (primitives, keys, secrets, vault, encoding), `src/lib/share/crypto.ts` (share links), `src/lib/invites/link.ts` (invite links), `src/lib/vault/keystore.ts` (what the browser keeps after unlock), `src/lib/vault/payload.ts` and `strength.ts`, `src/lib/members/pins.ts`, and `docs/crypto.md`, checking that the document and the code say the same thing. The existing tests were run, and three tests were added that pin the limits below (`src/lib/crypto/limits.test.ts`).

## What held up

- **Primitives and composition.** Only WebCrypto's HKDF-SHA-256, AES-256-GCM, X25519 (P-256 fallback) and `hash-wasm`'s Argon2id. No home-made construction. The wrap is HPKE-shaped but says it is not HPKE.
- **Keys and nonces.** Every AES-GCM key is used with a nonce that cannot repeat: wrap keys and IVs come from a fresh ephemeral secret; each secret version has its own subkey with a random 96-bit IV per field; vault blobs use a fresh salt and IV per wrap.
- **Context binding.** Every HKDF `info` and every AAD is a length-prefixed tuple (`lp`), so fields cannot slide into each other. Environment, secret, version, key version and field name are all bound, as are the recipient's and the ephemeral public keys. Swapping, replaying an old version, or moving a name ciphertext into the value slot fails authentication (tested).
- **Parsing.** Blobs are strict: version, algorithm, field count and lengths are checked before any key is derived. The vault header, including the Argon2 parameters, is the AAD, so the server cannot lower them without breaking the unlock. Share links refuse a password derivation weaker than a floor whatever the envelope claims.
- **Failures.** Authentication failures are one generic error. Low-order ECDH output is rejected.
- **Recovery key.** 256 random bits, so no password hashing is needed, and the vault open path takes no server secret (tested).

No break in how these fit together was found.

## Findings

Ordered by how much they change what you should trust. None are bugs in the sense of code doing something other than documented; they are limits of the design, and the first two were not clearly written down before.

1. **Environment key grants are not authenticated.** Anyone holding your public key, including the server or someone who can write to its database, can wrap a key of their choosing to you. If they also raise the environment's current key version, an honest client will seal your *new* writes under a key they know. Existing secrets stay unreadable to them, and the substitution shows up as a failure to open old secrets only if you look. The browser's checks (pinned keys, fingerprints) cover people you add, not a grant written behind your back. The real fix is signed grants or a key-version chain signed by an administrator; that does not exist yet. Until it does, the confidentiality of new writes assumes the database cannot be *written* by an attacker, not only read. (Pinned by a test.)
2. **First contact with a person's key is trusted.** Public keys come from the server. The first one this browser sees for someone in an organisation is remembered, and a later change is flagged, but a swap before the first sighting, or in a browser with cleared storage, is not caught. Compare fingerprints out of band for anyone you share environments with. Invite links avoid this: they wrap to a throwaway key that travels in the link.
3. **The passphrase strength estimate is crude.** It rewards length and alphabet, with a short list of common words. "Sunshine2024!" rates strong. Argon2id (64 MiB, 3 passes) slows an attacker who has stolen the passphrase blob from the database, but it cannot rescue a guessable passphrase. A dictionary-aware estimator (zxcvbn-style) would be a real improvement, and the creation form could require a generated four-word passphrase. (Pinned by a test.)
4. **Lengths and shape are visible.** Ciphertext length equals plaintext length plus 16, with no padding; the server also sees how many secrets exist, when they change, and the plaintext names of organisations, projects and environments (the landing page says so). (Pinned by a test.)
5. **Some state is controlled by the server and not authenticated:** the `deleted` flag on a version, the ordering of versions, and which version is "latest". A server can hide a deletion or withhold the newest version; `docs/crypto.md` section 4 covers rollback, and this adds the deletion flag. Per-write signatures are deferred.
6. **X25519 is not available in every browser.** A key pair made where it exists cannot be opened where it does not, and the P-256 fallback has only been exercised on Node's WebCrypto. The unlock screen now says so instead of blaming the passphrase.
7. **Argon2id is as correct as `hash-wasm`.** One single-lane reference vector is checked; multi-lane Argon2id and the RFC 9106 path are not.
8. **Keys at rest in the browser.** After unlock the private key is a non-extractable `CryptoKey` in IndexedDB (idle lock after 15 minutes; 7 days on a "trusted" browser). Script running in the page can use it without exporting it, which is why the Content Security Policy matters (see `SECURITY.md`).

## Not looked at

Better Auth and the sign-in code, the CSP and rate limits (see `SECURITY.md`), the supply chain of dependencies, side channels and timing, the correctness of the browser's own WebCrypto, and anything that needs a running attacker rather than a reader of the code. No fuzzing or formal analysis was done.

## What would make this an audit

A named, independent reviewer; a written scope that includes the protocol (`docs/crypto.md`) and the browser key handling; findings published with the fixes; and the report linked from the README and the landing page, with its date and the commit it covered.
