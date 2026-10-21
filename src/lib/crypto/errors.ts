export type CryptoErrorCode =
  /** Blob or key string is not in a recognised v1 format. */
  | "malformed"
  /** Caller passed an invalid argument (size, range, empty passphrase...). */
  | "invalid-input"
  /** Authentication failed: wrong key/passphrase, tampering, or wrong context. */
  | "decryption-failed"
  /** The runtime lacks a required primitive. */
  | "unsupported";

/**
 * The only error type thrown by this module for bad input or failed
 * authentication. Messages are deliberately generic: a failed unwrap never says
 * whether the key, the passphrase, the context or the ciphertext was wrong.
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = "CryptoError";
    this.code = code;
  }
}

export const malformed = (what: string) => new CryptoError("malformed", `malformed ${what}`);
export const invalid = (msg: string) => new CryptoError("invalid-input", msg);
export const authFailed = () => new CryptoError("decryption-failed", "decryption failed");
