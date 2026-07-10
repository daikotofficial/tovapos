const HASH_ITERATIONS = 120_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function hashPassword(
  password: string
): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  return {
    passwordHash: await derivePasswordHash(password, salt),
    passwordSalt: bytesToBase64(salt),
  };
}

export async function verifyPassword(
  password: string,
  passwordHash?: string,
  passwordSalt?: string
): Promise<boolean> {
  if (!passwordHash || !passwordSalt) return false;
  const candidate = await derivePasswordHash(password, base64ToBytes(passwordSalt));
  return candidate === passwordHash;
}
