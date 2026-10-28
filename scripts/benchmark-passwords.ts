import { performance } from 'node:perf_hooks';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { passwordCrypto } from '../convex/authCrypto.ts';

// Synthetic inputs only; this measures local Node, never a Convex deployment.
const password = 'synthetic-benchmark-password';
const iterations = 5;
async function mean(work: () => Promise<unknown>) {
  const started = performance.now();
  for (let i = 0; i < iterations; i++) await work();
  return (performance.now() - started) / iterations;
}
const legacyDerivationMeanMs = await mean(() =>
  scryptAsync(password, '0123456789abcdef0123456789abcdef', { N: 16384, r: 8, p: 1, dkLen: 64 }),
);
const v2HashMeanMs = await mean(() => passwordCrypto.hashSecret(password));
const secret = await passwordCrypto.hashSecret(password);
const v2VerifyMeanMs = await mean(() => passwordCrypto.verifySecret(password, secret));
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      iterations,
      legacyDerivationMeanMs,
      v2HashMeanMs,
      v2VerifyMeanMs,
    },
    null,
    2,
  ),
);
