import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env.convex.local', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(process.env.CONVEX_URL || ''))
  throw Error('Configure CONVEX_URL com o deployment Convex isolado antes de compilar.');
process.env.DENTEC_CONVEX_NATIVE = '1';
await import('./native-print-assets.mjs');
const { build } = await import('vite');
await build();
