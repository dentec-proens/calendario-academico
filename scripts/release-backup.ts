import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { environments } from '../config/environments.ts';

export function changesBackend(paths: string[]) {
  return paths.some(
    (path) =>
      /^(convex|src|config|migration|assets\/printing)\//.test(path) ||
      ['package.json', 'pnpm-lock.yaml', 'convex.json', '.npmrc', 'pnpm-workspace.yaml'].includes(
        path,
      ),
  );
}
export async function backupProduction(
  root: string,
  commit: string,
  previous: string,
  run: (path: string) => void,
  directory = process.env.DENTEC_RELEASE_BACKUP_DIR,
) {
  if (!directory)
    throw Error(
      'Configure DENTEC_RELEASE_BACKUP_DIR fora do repositório: o backend mudou e será exportado antes do deploy.',
    );
  const {
    chmodSync,
    realpathSync,
    statSync,
    openSync,
    readSync,
    closeSync,
    createReadStream,
    writeFileSync,
  } = await import('node:fs');
  const { relative, isAbsolute, sep } = await import('node:path');
  if (!isAbsolute(directory)) throw Error('O diretório privado de backup deve ser absoluto.');
  const parent = realpathSync(directory),
    workspace = realpathSync(root),
    fromWorkspace = relative(workspace, parent);
  if (
    !fromWorkspace ||
    (fromWorkspace !== '..' && !fromWorkspace.startsWith(`..${sep}`) && !isAbsolute(fromWorkspace))
  )
    throw Error('O backup com dados e sessões deve ficar fora do repositório.');
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
