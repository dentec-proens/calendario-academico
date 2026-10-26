import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-fs';
import { assertExpansion, assertRemoteFunctions, fingerprint } from './release-contracts.ts';
import type { Contracts } from './release-contracts.ts';
import { assertPlan } from '../convex/releases/plan.ts';
import type { ReleasePlan } from '../convex/releases/plan.ts';
import { environments } from '../config/environments.ts';

export function changesBackend(paths: string[]) {
  return paths.some(
    (path) =>
      /^(convex|src|config|migration|assets\/printing|release)\//.test(path) ||
      ['package.json', 'pnpm-lock.yaml', 'convex.json', '.npmrc', 'pnpm-workspace.yaml'].includes(
        path,
      ),
  );
}
export async function inspectBackend(
  root: string,
  baseline: string,
  paths: string[],
  remote: unknown,
  resumed = false,
) {
  const plan = JSON.parse(readFileSync(join(root, 'release/plan.json'), 'utf8')) as ReleasePlan;
  assertPlan(plan);
  if (plan.baseline !== baseline) throw Error('O plano não pertence ao backend instalado.');
  for (const path of plan.tests)
    if (
      !/^test\/[\w/.-]+\.test\.ts$/.test(path) ||
      path.includes('..') ||
      !existsSync(join(root, path))
    )
      throw Error('O plano aponta para um teste inexistente ou inválido.');
  const forbidden = paths.filter(
    (path) =>
      /^convex\/(auth|access\/)/.test(path) ||
      [
        'convex/http.ts',
        'convex/convex.config.ts',
        'convex/lib/shared.ts',
        'convex/lib/maintenance.ts',
        'config/environments.ts',
        'convex.json',
        'pnpm-lock.yaml',
        '.npmrc',
        'pnpm-workspace.yaml',
      ].includes(path) ||
      /^src\/printing\/chromium/.test(path),
  );
  if (forbidden.length)
    throw Error(
      `A expansão online preserva autenticação, componentes e runtime: ${forbidden.join(', ')}.`,
    );
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const previousPackage = JSON.parse(git('show', `${baseline}:package.json`)) as {
    dependencies: unknown;
  };
  const nextPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: unknown;
  };
  if (fingerprint(previousPackage.dependencies) !== fingerprint(nextPackage.dependencies))
    throw Error('Mudanças nas dependências de produção exigem um procedimento próprio.');
  const directory = mkdtempSync(join(tmpdir(), 'release-contracts-'));
  try {
    const archive = execFileSync('git', ['archive', baseline], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    await pipeline(Readable.from([archive]), tar.extract(directory));
    symlinkSync(
      join(root, 'node_modules'),
      join(directory, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const snapshot = (source: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ['--import', 'tsx', join(root, 'scripts/release-contract-snapshot.ts'), source],
          {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        ),
      ) as Contracts;
    const before = snapshot(directory),
      after = snapshot(root);
    assertRemoteFunctions(remote, resumed ? after : before, environments.production.url);
    assertExpansion(before, after, plan);
    return { plan, before, after, planHash: fingerprint(plan), contractHash: fingerprint(after) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// The same driver is used by the CLI and fault-injection tests. Each batch
// commits its data and cursor together in Convex; a lost response can be retried.
export async function migrateAndVerify(
  plan: ReleasePlan,
  batch: (id: string, verify: boolean) => { done: boolean; count: number },
  { now = Date.now, timeoutMs = 20 * 60_000 }: { now?: () => number; timeoutMs?: number } = {},
) {
  const started = now();
  for (const migration of plan.migrations)
    for (const verify of [false, true]) {
      for (;;) {
        const result = batch(migration.id, verify);
        if (
          !result ||
          typeof result.done !== 'boolean' ||
          !Number.isSafeInteger(result.count) ||
          result.count < 0
        )
          throw Error('O lote não retornou um checkpoint válido.');
        if (result.done) break;
        if (now() - started >= timeoutMs)
          throw Error(
            'Migração incompleta; os checkpoints foram preservados e o candidato não será promovido.',
          );
      }
    }
}

export async function backupForMigration(
  root: string,
  commit: string,
  baseline: string,
  run: (path: string) => void,
  directory = process.env.DENTEC_RELEASE_BACKUP_DIR,
) {
  if (!directory)
    throw Error('Configure DENTEC_RELEASE_BACKUP_DIR fora do repositório antes de migrar dados.');
  const { realpathSync, statSync, openSync, readSync, closeSync, createReadStream, writeFileSync } =
    await import('node:fs');
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
      backend: baseline,
      deployment: environments.production.deployment,
      sha256: hash.digest('hex'),
      includesFileStorage: true,
    }),
    { mode: 0o600 },
  );
  return privateDirectory;
}
