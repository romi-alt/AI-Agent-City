import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 as lower-case hex: how cookie tokens and login states are stored (never the values themselves). */
export const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** A random 256-bit token, base64url (43 characters). */
export const randomToken = () => randomBytes(32).toString('base64url');

/** Constant-time string equality (lengths are compared first, which reveals only the length). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts secrets kept at rest in identity.session (refresh and ID tokens) with AES-256-GCM. The key is derived
 * from SESSION_ENCRYPTION_KEY with HKDF, so the configured secret is never used directly as a cipher key. Every
 * ciphertext is bound to a context string (the session id and the field), so a value copied to another row or
 * field fails to decrypt.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', Buffer.from(secret, 'utf8'), 'agentcity/identity', 'session-token-encryption/v1', 32),
    );
  }

  encrypt(plaintext: string, context: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
  }

  /** Throws if the value was tampered with, encrypted under another key, or for another context. */
  decrypt(sealed: Buffer, context: string): string {
    if (sealed.length < 1 + IV_BYTES + TAG_BYTES || sealed[0] !== VERSION) throw new Error('Unreadable ciphertext');
    const iv = sealed.subarray(1, 1 + IV_BYTES);
    const tag = sealed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
      'utf8',
    );
  }
}
