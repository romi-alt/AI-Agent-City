import { createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 time-based one-time passwords (what Google Authenticator / 1Password / Authy use). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

export function newSecret() {
  return base32(randomBytes(20));
}

export function otpauthUrl(secret: string, account: string, issuer = 'Fast Sales Office') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

/**
 * Checks a 6-digit code against the current time step ±1 (clock drift).
 * Returns the matched step so the caller can refuse to accept the same code twice.
 */
export function verifyTotp(secret: string, code: string, lastStep = -1, now = Date.now()): number | undefined {
  if (!/^\d{6}$/.test(code)) return;
  const step = Math.floor(now / 1000 / STEP);
  const key = unbase32(secret);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    if (hotp(key, s) === code) return s;
  }
}

export function totpNow(secret: string, now = Date.now()) {
  return hotp(unbase32(secret), Math.floor(now / 1000 / STEP));
}

function hotp(key: Buffer, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

function base32(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
