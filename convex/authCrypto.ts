import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const legacyPrefix = 'dentec-scrypt-v1';
const currentPrefix = 'dentec-scrypt-v2';
const saltPattern = /^[a-f0-9]{32}$/i;
const hashPattern = /^[a-f0-9]{128}$/i;

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128)
    throw Error('A senha deve ter entre 10 e 128 caracteres.');
}

export function legacySecret(salt: string, hash: string) {
  if (!saltPattern.test(salt) || !hashPattern.test(hash))
    throw Error('Credencial legada inválida.');
  return `${legacyPrefix}$${salt}$${hash}`;
}

async function derive(password: string, salt: string, p: 1 | 5) {
  // Keep the legacy UTF-8 hexadecimal salt representation. Both policies use
  // ~16 MiB for scrypt, never the 128 MiB alternative that exceeds Convex RAM.
  return scryptAsync(password, salt, { N: 16384, r: 8, p, dkLen: 64, maxmem: 32 * 1024 * 1024 });
}

function parseSecret(secret: string) {
  const parts = secret.split('$');
  let p: 1 | 5;
  let salt: string;
  let hash: string;
  if (parts.length === 3 && parts[0] === legacyPrefix) {
    p = 1;
    [, salt, hash] = parts;
  } else if (
    parts.length === 6 &&
    parts[0] === currentPrefix &&
    parts[1] === '16384' &&
    parts[2] === '8' &&
    parts[3] === '5'
  ) {
    p = 5;
    salt = parts[4];
    hash = parts[5];
  } else return null;
  // Only the two known policies are accepted. Persisted input cannot request
  // arbitrary memory/CPU factors, even if a malformed record is introduced.
  if (!saltPattern.test(salt) || !hashPattern.test(hash)) return null;
  return { p, salt, hash };
}

export const isSupportedPasswordSecret = (secret: string) => parseSecret(secret) !== null;

export const passwordCrypto = {
  async hashSecret(password: string) {
    validatePassword(password);
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    return `${currentPrefix}$16384$8$5$${salt}$${bytesToHex(await derive(password, salt, 5))}`;
  },
  async verifySecret(password: string, secret: string) {
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) return false;
    const parsed = parseSecret(secret);
    if (!parsed) return false;
    const { p, salt, hash } = parsed;
    const actual = await derive(password, salt, p);
    const expected = hexToBytes(hash);
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  },
};
