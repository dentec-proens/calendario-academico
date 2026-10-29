import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupForMigration } from '../../scripts/release-backend';

test('migration backup is private, outside the repository, and retains a digest receipt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-backup-test-'));
  const root = join(directory, 'workspace');
  mkdirSync(root);
  try {
    await expect(
      backupForMigration(root, 'a'.repeat(40), 'b'.repeat(40), () => undefined, root),
    ).rejects.toThrow(/fora/);
    const misleading = join(root, '..private');
    mkdirSync(misleading);
    await expect(
      backupForMigration(root, 'a'.repeat(40), 'b'.repeat(40), () => undefined, misleading),
    ).rejects.toThrow(/fora/);
    const path = await backupForMigration(
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
    expect(receipt.includesFileStorage).toBe(true);
    await expect(
      backupForMigration(
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
