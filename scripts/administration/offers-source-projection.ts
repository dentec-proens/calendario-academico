/** Freeze a pre-v4 proof from the independently archived, pinned source. No remote operations. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fingerprint } from './canonical.ts';
import {
  assertValue,
  loadDomainRuntime,
  projectSnapshot,
  readVerifiedSnapshot,
  sha256,
} from './offers-projection.ts';
import type { DomainProjection } from './offers-projection.ts';

export const SOURCE_COMMIT = '34e35b9eaed1162d676299920e4d9b27680cc549';
export const SOURCE_REF = SOURCE_COMMIT;
export const ORACLE_SHA256 = 'eff78c9cb6b7e88f6061bb4a2b40c99a2cce22c2e054cc2490b569dd9e77e75c';
export interface FrozenSource {
  format: 2;
  sourceCommit: string;
  sourceTreeDigest: string;
  snapshotSha256: string;
  oracleSha256: string;
  projectionDigest: string;
  projection: DomainProjection;
}
export function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : process.argv[index + 1];
  assertValue(value && isAbsolute(value), `opcao-absoluta-${name}`);
  return value;
}
export function savePrivate(path: string, value: unknown) {
  assertValue(isAbsolute(path) && !existsSync(path), 'saida-absoluta-nova');
  const directory = realpathSync(dirname(path));
  assertValue((statSync(directory).mode & 0o077) === 0, 'diretorio-privado-700');
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  chmodSync(path, 0o600);
}
export function assertOracle(path: string) {
  assertValue(sha256(readFileSync(path)) === ORACLE_SHA256, 'oraculo-original-alterado');
}
export function assertArchivedSource(codeRoot: string, repository: string) {
  assertValue(isAbsolute(codeRoot) && isAbsolute(repository), 'origem-absoluta');
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repository, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  const commit = git('rev-parse', `${SOURCE_REF}^{commit}`).trim();
  assertValue(commit === SOURCE_COMMIT, 'commit-origem-invalido');
  const records = git(
    'ls-tree',
    '-rz',
    commit,
    '--',
    'src',
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.base.json',
  )
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
      assertValue(match, 'entrada-arquivada-invalida');
      return { blob: match[2]!, path: match[3]! };
    });
  assertValue(
    records.some((entry) => entry.path === 'src/domain/calendar/readiness.ts'),
    'origem-incompleta',
  );
  for (const record of records) {
    const path = join(codeRoot, record.path);
    assertValue(lstatSync(path).isFile(), 'fonte-arquivada-nao-regular');
    const bytes = readFileSync(path);
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assertValue(blob === record.blob, 'fonte-arquivada-divergente');
  }
  const expected = new Set(
    records.filter((entry) => entry.path.startsWith('src/')).map((entry) => entry.path),
  );
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(codeRoot, relative), {
      withFileTypes: true,
    })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else assertValue(entry.isFile() && expected.has(path), 'arquivo-extra-na-origem');
    }
  };
  walk('src');
  return { commit, treeDigest: fingerprint(records) };
}
export async function captureSource(
  snapshotPath: string,
  codeRoot: string,
  repository: string,
  oraclePath: string,
): Promise<FrozenSource> {
  assertOracle(oraclePath);
  const source = assertArchivedSource(codeRoot, repository);
  const snapshot = readVerifiedSnapshot(snapshotPath);
  const runtime = await loadDomainRuntime(codeRoot, 'source-v3');
  const projection = projectSnapshot(snapshot, runtime);
  return {
    format: 2,
    sourceCommit: source.commit,
    sourceTreeDigest: source.treeDigest,
    snapshotSha256: snapshot.sha256,
    oracleSha256: ORACLE_SHA256,
    projectionDigest: fingerprint(projection),
    projection,
  };
}
async function main() {
  const result = await captureSource(
    option('snapshot'),
    option('code-root'),
    option('repository'),
    option('oracle'),
  );
  savePrivate(option('out'), result);
  console.log(
    `Projeção anterior congelada: ${Object.keys(result.projection.calendars).length} calendários; digest ${fingerprint(result)}.`,
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void main().catch(() => {
    console.error(
      'Não foi possível congelar a origem v3; confira a cópia privada e os argumentos.',
    );
    process.exitCode = 1;
  });
}
