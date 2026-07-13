import { pbkdf2, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const SCRYPT_KEY_LENGTH = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordServer(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$32768$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPasswordServer(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, ...parts] = encoded.split('$');
    if (algorithm === 'scrypt') {
      const [n, r, p, saltBase64, expectedBase64] = parts;
      const expected = Buffer.from(expectedBase64, 'base64');
      const actual = await scryptAsync(
        password,
        Buffer.from(saltBase64, 'base64'),
        expected.length,
        {
          N: Number(n),
          r: Number(r),
          p: Number(p),
          maxmem: 64 * 1024 * 1024,
        }
      );
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    }

    if (algorithm === 'pbkdf2-sha256') {
      const [iterations, saltBase64, expectedBase64] = parts;
      const expected = Buffer.from(expectedBase64, 'base64');
      const actual = await pbkdf2Async(
        password,
        Buffer.from(saltBase64, 'base64'),
        Number(iterations),
        expected.length,
        'sha256'
      );
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    }
  } catch {
    return false;
  }

  return false;
}

export function encodeLegacyBrowserPassword(hash: string, salt: string): string {
  return `pbkdf2-sha256$120000$${salt}$${hash}`;
}

export function passwordStrengthError(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/\d/.test(password)) return 'Password must include a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a symbol';
  return null;
}
