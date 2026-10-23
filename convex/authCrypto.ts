import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const prefix = 'dentec-scrypt-v1';

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128)
    throw Error('A senha deve ter entre 10 e 128 caracteres.');
}

export function legacySecret(salt: string, hash: string) {
  if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(hash))
    throw Error('Credencial legada inválida.');
  return `${prefix}$${salt}$${hash}`;
}

async function derive(password: string, salt: string) {
  // Node's scrypt default: N=16384, r=8, p=1, 64 bytes. The old salt
  // was passed as a UTF-8 hexadecimal string, rather than decoded bytes.
  return scryptAsync(password, salt, { N: 16384, r: 8, p: 1, dkLen: 64 });
}

export const passwordCrypto = {
  async hashSecret(password: string) {
    validatePassword(password);
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    return legacySecret(salt, bytesToHex(await derive(password, salt)));
  },
  async verifySecret(password: string, secret: string) {
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) return false;
    const parts = secret.split('$');
    if (
      parts.length !== 3 ||
      parts[0] !== prefix ||
      !/^[a-f0-9]{32}$/i.test(parts[1]) ||
      !/^[a-f0-9]{128}$/i.test(parts[2])
    )
      return false;
    const actual = await derive(password, parts[1]);
    const expected = hexToBytes(parts[2]);
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  },
};
