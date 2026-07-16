import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32ToBuffer(secret: string): Buffer {
  const clean = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) throw new Error('Invalid TOTP secret');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpAt(secret: string, step: number): string {
  const key = base32ToBuffer(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const cleanCode = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const nowStep = Math.floor(Date.now() / 30_000);
  const input = Buffer.from(cleanCode);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(totpAt(secret, nowStep + offset));
    if (expected.length === input.length && timingSafeEqual(expected, input)) return true;
  }
  return false;
}

export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`TOVAPOS Admin:${email}`);
  const issuer = encodeURIComponent('TOVAPOS Admin');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
