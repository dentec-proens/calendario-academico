import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createReleaseSnapshot } from '../../scripts/release-snapshot.ts';

test('o snapshot publica somente HEAD e preserva índice, arquivos locais e commits concorrentes', () => {
  const repository = mkdtempSync(join(tmpdir(), 'release-snapshot-test-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: 'pipe' }).trim();
  let snapshot: ReturnType<typeof createReleaseSnapshot> | undefined;
  try {
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Teste local');
    git('config', 'user.email', 'test@example.invalid');
    writeFileSync(join(repository, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(repository, 'source.txt'), 'commit original');
    git('add', '.');
    git('commit', '-m', 'Estado original');
    const commit = git('rev-parse', 'HEAD');
    writeFileSync(join(repository, 'source.txt'), 'alteração staged');
    git('add', 'source.txt');
    writeFileSync(join(repository, 'source.txt'), 'edição posterior');
    writeFileSync(join(repository, 'untracked.txt'), 'novo arquivo privado');
    writeFileSync(join(repository, 'ignored.txt'), 'configuração privada');
    const status = git('status', '--porcelain');
    const index = git('show', ':source.txt');

    snapshot = createReleaseSnapshot(repository, commit);
    expect(readFileSync(join(snapshot.directory, 'source.txt'), 'utf8')).toBe('commit original');
    expect(existsSync(join(snapshot.directory, 'untracked.txt'))).toBe(false);
    expect(existsSync(join(snapshot.directory, 'ignored.txt'))).toBe(false);
    expect(git('status', '--porcelain')).toBe(status);
    expect(git('show', ':source.txt')).toBe(index);

    git('commit', '-m', 'Outro trabalho avança main');
    expect(git('rev-parse', 'HEAD')).not.toBe(commit);
    expect(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: snapshot.directory,
        encoding: 'utf8',
      }).trim(),
    ).toBe(commit);
    expect(readFileSync(join(repository, 'source.txt'), 'utf8')).toBe('edição posterior');
    snapshot.dispose();
    expect(existsSync(snapshot.directory)).toBe(false);
    snapshot = undefined;
    expect(git('worktree', 'list', '--porcelain')).not.toContain('detached');
    expect(readFileSync(join(repository, 'untracked.txt'), 'utf8')).toBe('novo arquivo privado');
    expect(readFileSync(join(repository, 'ignored.txt'), 'utf8')).toBe('configuração privada');
  } finally {
    snapshot?.dispose();
    rmSync(repository, { recursive: true, force: true });
  }
});
