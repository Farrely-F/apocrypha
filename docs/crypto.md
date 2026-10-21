# Apocrypha crypto protocol (v1)

> **UNAUDITED.** This is a from-scratch composition of standard primitives, written by the project authors. No independent review has happened. Do not rely on it to protect anything you cannot afford to lose until one has.

Implementation: `src/lib/crypto/` (framework-free, no React/Next imports; runs in browsers and Node's `webcrypto`). Design context: `docs/DESIGN.md` sections 3, 5, 11, 12.

## 1. Primitives

| Purpose | Primitive | Where |
|---|---|---|
| Key agreement | X25519 (P-256 ECDH fallback when X25519 is unavailable) | WebCrypto |
| KDF | HKDF-SHA-256 (RFC 5869), empty salt, domain-separated `info` | WebCrypto |
| AEAD | AES-256-GCM, 96-bit IV, 128-bit tag | WebCrypto |
| Passphrase KDF | Argon2id | `hash-wasm` (WASM) |
| Randomness | `crypto.getRandomValues` | WebCrypto |

No novel constructions. The wrap is HPKE-shaped (ephemeral ECDH, HKDF, AEAD) but is **not** RFC 9180 HPKE and is not interoperable with it.

## 2. Conventions

- **Blobs are strings** of `|`-separated fields; binary fields are base64url without padding. Every blob starts with `v1|<alg>|...`. Parsers reject unknown versions, unknown algorithms, the wrong number of fields, and wrong field lengths. A future change means a new version tag, never a silent reinterpretation.
- **`lp(...)`** (length-prefixed tuple): each part is a 4-byte big-endian length followed by its bytes. Strings are UTF-8; integers (`version`, `key_version`) are 4-byte big-endian uint32. `lp` is used for every HKDF `info` and AES-GCM AAD so fields cannot bleed into each other (`("ab","c")` != `("a","bc")`).
- **Public key**: `v1|x25519|<raw 32 bytes>` or `v1|p256|<uncompressed SEC1 point, 65 bytes>`.
- **Private key plaintext**: PKCS#8 DER.
- All authentication failures surface as a single generic `CryptoError("decryption failed")`. The code never says whether the key, passphrase, context or ciphertext was wrong.

## 3. Environment key wrapping ("grants")

An environment key is 32 random bytes. It is wrapped to each principal's public key. Context is `("env-key", env_id, key_version)`.

```
wrap(key, recipient_pub, ctx):
  (eph_sk, eph_pk) = fresh ephemeral key pair, same alg as recipient
  Z    = ECDH(eph_sk, recipient_pub)              # reject all-zero Z
  info = lp("apocrypha/v1/wrap", alg, eph_pk_raw, recipient_pub_raw, ...ctx)
  okm  = HKDF-SHA256(ikm=Z, salt="", info, L=44)
  K, IV = okm[0:32], okm[32:44]
  ct   = AES-256-GCM(K, IV, aad=info, key)        # 32 + 16 bytes
  blob = v1|<alg>-hkdf-a256gcm|b64u(eph_pk_raw)|b64u(ct)
```

The key and IV are both derived from a fresh ephemeral secret, so the deterministic IV is never reused (same as HPKE). The recipient's public key and the context are bound into both the KDF and the AAD, so a grant cannot be replayed for another environment, another key version, or another principal.

## 4. Secret versions

Each secret version has its own subkey, derived from the environment key at that `key_version`:

```
ctx    = (env_id, secret_id, version, key_version)
subkey = HKDF-SHA256(ikm=env_key, salt="", info=lp("apocrypha/v1/secret-subkey", ...ctx), L=32)
aad    = lp("apocrypha/v1/secret-aad", field, ...ctx)      # field in {"name","value","meta"}
field_blob = v1|a256gcm|b64u(iv)|b64u(AES-256-GCM(subkey, iv, aad, utf8(plaintext)))
```

- IV: 12 random bytes per field encryption.
- `field` is part of the AAD (an addition to the four ids in DESIGN.md) so a name ciphertext cannot be presented as a value.
- Plaintext cap: 65 536 UTF-8 bytes per field (`MAX_SECRET_VALUE_BYTES`).
- Decryption with a different `env_id`, `secret_id`, `version` (replay of an older or newer version) or `key_version` fails authentication.

What this does **not** prevent: the server withholding or rolling back the *latest* version of a secret (it can serve an older, validly encrypted version under that version's own number; version-number checks are the caller's job); and a reader forging new ciphertext (they hold the environment key; see DESIGN.md section 2, per-write signatures deferred).

## 5. Vault blobs

The user's long-term private key (PKCS#8) is wrapped twice.

### 5.1 Passphrase blob

```
v1|argon2id-a256gcm|<keyalg>|m=<KiB>,t=<iterations>,p=<parallelism>|b64u(salt16)|b64u(iv12)|b64u(ct)

raw = Argon2id(password=utf8(NFKC(passphrase)), salt, m, t, p, outlen=32)
kek = HKDF-SHA256(ikm=raw, salt="", info=lp("apocrypha/v1/vault-kek"), L=32)
ct  = AES-256-GCM(kek, iv, aad=utf8("v1|argon2id-a256gcm|<keyalg>|<params>|<salt>"), pkcs8)
```

- **Parameters live in the blob** (default `m=65536,t=3,p=1`, i.e. 64 MiB), authenticated as AAD. To raise them, call `changePassphrase(blob, old, new, newParams)` (also usable with the same passphrase); `readVaultKdfParams(blob)` lets the app decide when to upgrade.
- Parse-time sanity bounds protect clients from hostile blobs: `p` 1..16, `t` 1..64, `8p <= m <= 1 GiB`. These are *not* a security floor; the application chooses what to create and when to upgrade.
- Passphrases are NFKC-normalised before hashing so visually identical input unlocks identically.
- Salt: 16 random bytes, fresh on every (re)wrap.

### 5.2 Recovery blob

The recovery key is 32 random bytes (256 bits), shown once as Crockford base32 in groups of four (`XXXX-XXXX-...`, 13 groups). It has full entropy, so no Argon2id is applied.

```
v1|recovery-a256gcm|<keyalg>|b64u(iv12)|b64u(ct)

kek = HKDF-SHA256(ikm=recovery_key, salt="", info=lp("apocrypha/v1/recovery-kek"), L=32)
ct  = AES-256-GCM(kek, iv, aad=utf8("v1|recovery-a256gcm|<keyalg>"), pkcs8)
```

The recovery key parser is tolerant of case, dashes/spaces and `O/I/L` typos; the AEAD tag catches everything else.

### 5.3 After unlock

`unlockVault` / `unlockVaultWithRecoveryKey` return a key pair whose private key is a **non-extractable** `CryptoKey` (DESIGN.md section 11). The plaintext PKCS#8 buffer is zeroed best-effort after import (JavaScript gives no guarantee). Storing the key in IndexedDB, idle auto-lock and the unlock UI are the app's job.

## 6. Public API (`src/lib/crypto/index.ts`)

| Function | Purpose |
|---|---|
| `generateKeyPair({alg?, extractable?})`, `importKeyPair`, `exportPrivateKey`, `supportsX25519` | Key pairs. Default alg is X25519 if supported, else P-256 |
| `generateEnvironmentKey()` | 32 random bytes |
| `wrapEnvironmentKey(envKey, recipientPublicKey, {envId, keyVersion})` / `unwrapEnvironmentKey(blob, keyPair, ctx)` | Grants |
| `encryptSecretVersion(envKey, ctx, {name, value, metadata?})` / `decryptSecretVersion(envKey, ctx, enc)` | Secret versions |
| `createVault(passphrase, {alg?, params?})` | New identity + passphrase blob + recovery blob + recovery key |
| `unlockVault(blob, passphrase)` / `unlockVaultWithRecoveryKey(blob, recoveryKey)` | Returns a `KeyPair` with a non-extractable private key |
| `changePassphrase(blob, old, new, params?)` / `resetPassphraseWithRecoveryKey(recoveryBlob, key, new, params?)` | Re-wrap; also how Argon2id params are raised |
| `readVaultKdfParams(blob)`, `DEFAULT_ARGON2_PARAMS` | Inspect/upgrade policy |
| `CryptoError` | Single error type |

Environment keys are plain `Uint8Array`s: they must be extractable to be wrapped to other principals. Keep them in memory only, and clear them on lock.

## 7. Known-answer vectors

Vectors are asserted in `src/lib/crypto/kat.test.ts` against (a) an independent reference built on `node:crypto` and (b) the pinned strings below. If a pinned string changes, the wire format changed: introduce `v2`.

### 7.1 Primitive vectors (published)

- X25519: RFC 7748 section 6.1 (Alice sk `77076d0a...2c2a`, Bob pk `de9edb7d...2b4f` -> `4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742`).
- HKDF-SHA-256: RFC 5869 test case 1.
- AES-256-GCM: GCM specification test case 16 (with AAD).
- Argon2: the reference README vector (`password`, salt `somesalt`, t=2, m=65536, p=4, 24 bytes) via `argon2i`. `hash-wasm` exposes no associated-data input, so the RFC 9106 Argon2id vector cannot be run; Argon2id correctness is delegated to `hash-wasm` (see section 8).

### 7.2 Protocol vectors

Common inputs:

```
env_key  = 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
iv       = a0a1a2a3a4a5a6a7a8a9aaab
secret ctx = env_id "env_01", secret_id "sec_01", version 3, key_version 2
```

**Per-version subkey**

```
64f19a18b39080a11c819fec8d261567f2b57d3db7ab25a48b5447504fc78898
```

**Secret field** (`field="value"`, plaintext `postgres://u:p@h/db`)

```
v1|a256gcm|oKGio6Slpqeoqaqr|jjtAdmGFBXU5GfE5LZZF3OsRt164Qj08YE6EuVHGFkNkr3s
```

**Environment key wrap** (ephemeral = RFC 7748 Alice, recipient = RFC 7748 Bob, ctx `("env-key","env_01",2)`)

```
v1|x25519-hkdf-a256gcm|hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo|O4FPWDoRLLx47osy-74_w4Hc6Hv3A08vSwt52J10DauecmbyP5wUsJ4A6gxPRVHL
```

**Passphrase blob** (private key = RFC 7748 Alice seed as PKCS#8, passphrase `correct horse`, `m=64,t=2,p=1`, salt `101112131415161718191a1b1c1d1e1f`, iv as above)

```
v1|argon2id-a256gcm|x25519|m=64,t=2,p=1|EBESExQVFhcYGRobHB0eHw|oKGio6Slpqeoqaqr|MQFNd3_2i9Vw-mre3sgk6QCh_mrBljTZUo71sOtEWCvLI07vGDKKu1TdBeEy-f3SPN9oxQ9KoraaBywQfuLx8g
```

(The test-only deterministic entry points `wrapKeyWithEphemeral`, `encryptFieldWithIv`, `sealWithPassphrase` live in the module files but are not exported from `index.ts`. Never use them in app code.)

The P-256 wrap is cross-checked against the `node:crypto` reference with random keys rather than a pinned vector.

## 8. Tests and what they cover

`npx vitest run` (see `vitest.config.ts`). Beyond the vectors: round trips for both algorithms; tampered ciphertext, IV, ephemeral key and header; swapped secret id, environment id, replayed version, wrong key version, wrong environment key, name/value field swap; wrong recipient, wrong passphrase, wrong recovery key, cross-blob type confusion; stored-parameter tampering; hostile Argon2id parameters; malformed/unknown-version blobs; the 64 KB cap; non-extractability of the unlocked private key; X25519 low-order input.

## 9. Not covered / known limits

- **Unaudited**, and not verified in real browsers (tests run on Node's `webcrypto`; X25519 availability varies by browser, hence the P-256 fallback).
- Argon2id is only as correct as `hash-wasm`. No independent Argon2id vector is checked in.
- JavaScript cannot guarantee zeroisation; buffers are wiped best-effort.
- The server delivers the code that runs this module (DESIGN.md section 2).
- No forward secrecy for grants beyond the ephemeral sender key: compromise of a recipient's long-term private key exposes every grant ever wrapped to it.
- Weak passphrases are weak regardless of Argon2id; the app should enforce a minimum.
- Version/rollback checks, write authorisation, and the audit chain live outside this module.
