import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupProduction } from '../../scripts/release-backup';

test('production backup is private, outside the repository, and retains a digest receipt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-backup-test-'));
  const root = join(directory, 'workspace');
  mkdirSync(root);
  try {
    await expect(
      backupProduction(root, 'a'.repeat(40), 'b'.repeat(40), () => undefined, root),
    ).rejects.toThrow(/fora/);
    const misleading = join(root, '..private');
    mkdirSync(misleading);
    await expect(
      backupProduction(root, 'a'.repeat(40), 'b'.repeat(40), () => undefined, misleading),
    ).rejects.toThrow(/fora/);
    const path = await backupProduction(
      root,
      'a'.repeat(40),
      'b'.repeat(40),
      (file) =>
        writeFileSync(file, Buffer.concat([Buffer.from([80, 75, 3, 4]), Buffer.alloc(100)])),
      directory,
    );
    const receipt = JSON.parse(readFileSync(join(path, 'receipt.json'), 'utf8')) as {
      sha256: string;
      includesFileStorage: boolean;
    };
    expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(statSync(join(path, 'before.zip')).mode & 0o777).toBe(0o600);
    expect(receipt.includesFileStorage).toBe(true);
    await expect(
      backupProduction(
        root,
        'a'.repeat(40),
        'b'.repeat(40),
        (file) => writeFileSync(file, 'Not an export'.repeat(10)),
        directory,
      ),
    ).rejects.toThrow(/ZIP/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
