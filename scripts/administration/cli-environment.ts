import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function withTargetEnvFile<T>(
  selection: { url: string; adminKey: string } | { deployment: string },
  run: (envFile: string) => T,
): T {
  const directory = mkdtempSync(join(tmpdir(), 'calendar-admin-env-'));
  const path = join(directory, 'target.env');
  try {
    const content =
      'adminKey' in selection
        ? `CONVEX_SELF_HOSTED_URL=${JSON.stringify(selection.url)}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${JSON.stringify(selection.adminKey)}\n`
        : `CONVEX_DEPLOYMENT=${JSON.stringify(`prod:${selection.deployment}`)}\n`;
    writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
    return run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
