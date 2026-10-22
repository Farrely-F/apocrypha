/**
 * Apocrypha crypto core (UNAUDITED). Framework-free; runs in browsers and in
 * Node's webcrypto. See docs/crypto.md for the protocol.
 */
import { type KeyPair, unwrapKey, wrapKey } from "./keys";
import { randomBytes } from "./encoding";
import { KEY_BYTES } from "./primitives";

export { CryptoError, type CryptoErrorCode } from "./errors";

// Key pairs
export {
  exportPrivateKey,
  generateKeyPair,
  importKeyPair,
  isSoftKey,
  supportsX25519,
  type KeyAlg,
  type KeyPair,
  type SoftKey,
} from "./keys";

// Environment keys
/** Fresh random 256-bit environment key. */
export const generateEnvironmentKey = () => randomBytes(KEY_BYTES);

export interface EnvironmentKeyContext {
  envId: string;
  keyVersion: number;
}

const envContext = (c: EnvironmentKeyContext) => ["env-key", c.envId, c.keyVersion] as const;

/** Wrap an environment key to a principal's public key (a "grant"). */
export function wrapEnvironmentKey(
  envKey: Uint8Array,
  recipientPublicKey: string,
  ctx: EnvironmentKeyContext,
): Promise<string> {
  return wrapKey(envKey, recipientPublicKey, envContext(ctx));
}

/** Unwrap a grant with the recipient's unlocked key pair. */
export function unwrapEnvironmentKey(
  blob: string,
  recipient: KeyPair,
  ctx: EnvironmentKeyContext,
): Promise<Uint8Array> {
  return unwrapKey(blob, recipient, envContext(ctx));
}

// Secret versions
export {
  MAX_SECRET_VALUE_BYTES,
  decryptSecretVersion,
  encryptSecretVersion,
  type EncryptedSecretVersion,
  type SecretContext,
  type SecretFields,
} from "./secrets";

// Vault
export {
  DEFAULT_ARGON2_PARAMS,
  changePassphrase,
  createVault,
  readVaultKdfParams,
  resetPassphraseWithRecoveryKey,
  unlockVault,
  unlockVaultWithRecoveryKey,
  type Argon2Params,
  type CreatedVault,
} from "./vault";
