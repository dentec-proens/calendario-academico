import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { presenceLifecyclePolicy } from './presence-lifecycle.ts';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function assertPresenceRuntime() {
  const require = createRequire(import.meta.url);
  const presencePath = require.resolve('@convex-dev/presence/package.json');
  for (const expected of presenceLifecyclePolicy.packages) {
    const packagePath =
      expected.name === '@convex-dev/presence'
        ? presencePath
        : createRequire(presencePath).resolve(`${expected.name}/package.json`);
    const packageRoot = dirname(packagePath);
    const info = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (item.isDirectory()) walk(path);
        else if (item.name.endsWith('.js')) files.push(path);
      }
    };
    walk(join(packageRoot, 'dist/component'));
    const hashes = files
      .sort()
      .map((path) => ({ path: relative(packageRoot, path), sha256: digest(readFileSync(path)) }));
    if (
      info.version !== expected.version ||
      digest(Buffer.from(JSON.stringify(hashes))) !== expected.componentDigest
    )
      throw Error('A implementação instalada de presença mudou; reavalie a política delimitada.');
  }
}
