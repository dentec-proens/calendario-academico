import { test, expect } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readReleaseEnvironment } from '../../scripts/release-environment.ts';

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'release-env-test-'));
  const root = join(directory, 'workspace');
  const backup = join(directory, 'backups');
  mkdirSync(join(root, '.vercel'), { recursive: true });
  mkdirSync(backup, { mode: 0o700 });
  const file = join(root, '.vercel/release.env');
  const write = (content: string, mode = 0o600) => {
    writeFileSync(file, content, { mode });
    chmodSync(file, mode);
  };
  return { directory, root, backup, write };
}

test('release.env supplies the token and the private backup directory', () => {
  const { directory, root, backup, write } = workspace();
  try {
    write(`# Release\nVERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${backup}\n`);
    expect(readReleaseEnvironment(root, {})).toEqual({
      token: 'vcp_synthetic',
      backupDirectory: backup,
    });
    expect(readReleaseEnvironment(root, { VERCEL_TOKEN: 'vcp_synthetic' }).token).toBe(
      'vcp_synthetic',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release.env problems are explained before any operation', () => {
  const { directory, root, backup, write } = workspace();
  try {
    expect(() => readReleaseEnvironment(root, {})).toThrow(
      /Falta \.vercel\/release\.env[^]*umask 077/,
    );
    write(`VERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${backup}\n`, 0o644);
    expect(() => readReleaseEnvironment(root, {})).toThrow(/chmod 600/);
    write(`VERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${backup}\nCONVEX_DEPLOY_KEY=x\n`);
    expect(() => readReleaseEnvironment(root, {})).toThrow(/Remova CONVEX_DEPLOY_KEY/);
    write(`DENTEC_RELEASE_BACKUP_DIR=${backup}\n`);
    expect(() => readReleaseEnvironment(root, {})).toThrow(/Falta VERCEL_TOKEN[^]*vercel\.com/);
    write('VERCEL_TOKEN=vcp_synthetic\n');
    expect(() => readReleaseEnvironment(root, {})).toThrow(
      /Falta DENTEC_RELEASE_BACKUP_DIR[^]*mkdir -m 700/,
    );
    write(`VERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${backup}\n`);
    expect(() => readReleaseEnvironment(root, { VERCEL_TOKEN: 'vcp_other' })).toThrow(
      /unset VERCEL_TOKEN/,
    );
    write(`VERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${join(backup, 'missing')}\n`);
    expect(() => readReleaseEnvironment(root, {})).toThrow(/mkdir -m 700/);
    write(`VERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${root}\n`);
    expect(() => readReleaseEnvironment(root, {})).toThrow(/fora do repositório/);
    chmodSync(backup, 0o755);
    write(`VERCEL_TOKEN=vcp_synthetic\nDENTEC_RELEASE_BACKUP_DIR=${backup}\n`);
    expect(() => readReleaseEnvironment(root, {})).toThrow(/chmod 700/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
