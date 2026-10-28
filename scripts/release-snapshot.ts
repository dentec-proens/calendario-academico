import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createReleaseSnapshot(repository: string, commit: string) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('O snapshot exige um SHA completo.');
  const temporary = mkdtempSync(join(tmpdir(), 'calendario-release-source-'));
  const directory = join(temporary, 'source');
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    git('worktree', 'add', '--detach', directory, commit);
  } catch (error) {
    if (existsSync(join(directory, '.git'))) git('worktree', 'remove', '--force', directory);
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return {
    directory,
    dispose() {
      git('worktree', 'remove', '--force', directory);
      rmSync(temporary, { recursive: true, force: true });
    },
  };
}
