import { mkdtempSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { environments } from '../config/environments.ts';

export function changesBackend(paths: string[]) {
  return paths.some(
    (path) =>
      /^(convex|src|config)\//.test(path) ||
      ['package.json', 'pnpm-lock.yaml', 'convex.json', '.npmrc', 'pnpm-workspace.yaml'].includes(
        path,
      ),
  );
}
// The export holds data and sessions: it must stay private and outside Git.
export function assertBackupDirectory(root: string, directory: string): string {
  if (!isAbsolute(directory)) throw Error('O diretório privado de backup deve ser absoluto.');
  let parent: string;
  try {
    parent = realpathSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw Error(`Crie o diretório privado de backup: mkdir -m 700 -p "${directory}"`);
  }
  const fromWorkspace = relative(realpathSync(root), parent);
  if (
    !fromWorkspace ||
    (fromWorkspace !== '..' && !fromWorkspace.startsWith(`..${sep}`) && !isAbsolute(fromWorkspace))
  )
    throw Error('O backup com dados e sessões deve ficar fora do repositório.');
  const stats = statSync(parent);
  if (!stats.isDirectory()) throw Error(`O backup exige um diretório: ${directory}.`);
  if (stats.mode & 0o077)
    throw Error(`O diretório de backup deve ser acessível só a você: chmod 700 "${directory}"`);
  return parent;
}
export async function backupProduction(
  root: string,
  commit: string,
  previous: string,
  run: (path: string) => void,
  directory: string,
) {
  const { chmodSync, openSync, readSync, closeSync, createReadStream, writeFileSync } =
    await import('node:fs');
  const parent = assertBackupDirectory(root, directory);
  const privateDirectory = mkdtempSync(join(parent, `release-${commit.slice(0, 8)}-`));
  const path = join(privateDirectory, 'before.zip');
  run(path);
  // The Convex CLI writes the export with the default umask; it holds data and credentials.
  chmodSync(path, 0o600);
  if (statSync(path).size < 22) throw Error('O export não produziu um backup válido.');
  const descriptor = openSync(path, 'r');
  try {
    const signature = Buffer.alloc(4);
    readSync(descriptor, signature, 0, 4, 0);
    if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
      throw Error('O backup não é um ZIP Convex.');
  } finally {
    closeSync(descriptor);
  }
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  writeFileSync(
    join(privateDirectory, 'receipt.json'),
    JSON.stringify({
      version: 1,
      commit,
      previous,
      deployment: environments.production.deployment,
      sha256: hash.digest('hex'),
      includesFileStorage: true,
    }),
    { mode: 0o600 },
  );
  return privateDirectory;
}
