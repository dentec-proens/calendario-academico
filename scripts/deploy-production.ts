import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as EnvironmentConfig from '../config/environments.ts';
import type * as EnvironmentTools from './environment.ts';
import type * as BackupTools from './release-backup.ts';
import type * as CandidateTools from './release-candidate.ts';
import type * as CoordinationTools from './release-coordination.ts';
import { createReleaseSnapshot } from './release-snapshot.ts';

const args = process.argv.slice(2);
const dryRun = args.length === 1 && args[0] === '--dry-run';
const root = fileURLToPath(new URL('../', import.meta.url));
let releaseRoot = root;
const lockRef = 'refs/heads/codex/production-release-lock';
function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: releaseRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { cwd: releaseRoot, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`Falhou: ${command} ${args[0] ?? ''}. Release interrompida.`);
}
function assertCode(commit?: string) {
  if (git('status', '--porcelain'))
    throw Error('O snapshot da release foi alterado durante a publicação.');
  if (git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'convex'))
    throw Error('Mova os arquivos ignorados de convex/ para fora da pasta antes de publicar.');
  if (commit && git('rev-parse', 'HEAD') !== commit)
    throw Error('O commit mudou durante a publicação.');
}
function assertOrigin(repository: string) {
  const urls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n');
  if (
    urls.length !== 1 ||
    ![
      `https://github.com/${repository}.git`,
      `https://github.com/${repository}`,
      `git@github.com:${repository}.git`,
      `ssh://git@github.com/${repository}.git`,
    ].includes(urls[0]!)
  )
    throw Error(`origin precisa apontar para github.com/${repository}.`);
}

let temporary: string | undefined;
let snapshot: ReturnType<typeof createReleaseSnapshot> | undefined;
let lock: string | undefined;
let completed = false;
let backendAttempted = false;
let promotionAttempted = false;
try {
  if (args.length && !dryRun) throw Error('Uso: pnpm deploy:production [--dry-run]');
  if (dryRun) {
    const { environments }: typeof EnvironmentConfig = await import('../config/environments.ts');
    console.log(
      `Destinos: Convex ${environments.production.deployment}; Vercel ${environments.vercel.team}/${environments.vercel.project}.`,
    );
    console.log(
      'Ordem: capturar HEAD em checkout isolado e instalar dependências fixadas → conferir destinos/reservar → build Production Vercel → backup se o backend mudou → deploy Convex → migrações → promover.',
    );
    console.log('Simulação: nenhum comando, conexão remota ou arquivo de ambiente foi alterado.');
  } else {
    const sourceBranch = git('branch', '--show-current');
    if (!sourceBranch) throw Error('A release exige uma branch de origem.');
    const commit = git('rev-parse', `refs/heads/${sourceBranch}`);
    snapshot = createReleaseSnapshot(root, commit);
    releaseRoot = snapshot.directory;
    assertCode(commit);
    console.log(`Snapshot da release: ${commit}. Alterações locais não serão publicadas.`);
    run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts']);
    assertCode(commit);
    const { environments }: typeof EnvironmentConfig = await import(
      pathToFileURL(join(releaseRoot, 'config/environments.ts')).href
    );
    const { assertNoTargetOverrides, convexCli }: typeof EnvironmentTools = await import(
      pathToFileURL(join(releaseRoot, 'scripts/environment.ts')).href
    );
    const { backupProduction, changesBackend }: typeof BackupTools = await import(
      pathToFileURL(join(releaseRoot, 'scripts/release-backup.ts')).href
    );
    const { productionCandidates }: typeof CandidateTools = await import(
      pathToFileURL(join(releaseRoot, 'scripts/release-candidate.ts')).href
    );
    const { parseReleaseStatus, waitForMigrations }: typeof CoordinationTools = await import(
      pathToFileURL(join(releaseRoot, 'scripts/release-coordination.ts')).href
    );
    assertNoTargetOverrides(process.env);
    const branch = environments.git.branch;
    if (sourceBranch !== branch) throw Error(`Publique pela branch ${branch}.`);
    console.log(
      `RELEASE — Convex ${environments.production.deployment}; Vercel ${environments.vercel.team}/${environments.vercel.project}.`,
    );
    console.log('Sem pnpm check ou testes. Typecheck do Convex preservado.');
    assertCode(commit);
    assertOrigin(environments.git.repository);
    const token = process.env.VERCEL_TOKEN;
    if (!token) throw Error('Configure VERCEL_TOKEN antes da release.');
    run('git', ['fetch', '--no-tags', 'origin', branch]);
    run('git', ['merge-base', '--is-ancestor', `origin/${branch}`, commit]);
    const platform = productionCandidates(token);
    const previous = await platform.current();
    run('git', ['merge-base', '--is-ancestor', previous.commit, commit]);
    const backend = changesBackend(
      git('diff', '--no-renames', '--name-only', previous.commit, commit, '--')
        .split('\n')
        .filter(Boolean),
    );
    if (backend && !process.env.DENTEC_RELEASE_BACKUP_DIR)
      throw Error(
        'Configure DENTEC_RELEASE_BACKUP_DIR fora do repositório: o backend mudou e será exportado antes do deploy.',
      );
    temporary = mkdtempSync(join(tmpdir(), 'calendario-release-'));
    const targetFile = join(temporary, 'production.env');
    writeFileSync(targetFile, `CONVEX_DEPLOYMENT=prod:${environments.production.deployment}\n`, {
      mode: 0o600,
    });
    const env = { ...process.env, CONVEX_DEPLOYMENT: `prod:${environments.production.deployment}` };
    function call(name: string, values: Record<string, unknown> = {}) {
      return execFileSync(
        process.execPath,
        [
          convexCli,
          'run',
          name,
          JSON.stringify(values),
          '--env-file',
          targetFile,
          '--codegen',
          'disable',
        ],
        {
          cwd: releaseRoot,
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim();
    }
    function metadata() {
      const value = JSON.parse(
        execFileSync(process.execPath, [convexCli, 'function-spec', '--env-file', targetFile], {
          cwd: releaseRoot,
          env,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ) as { url: string; functions: Array<{ identifier?: string }> };
      if (value.url !== environments.production.url || !Array.isArray(value.functions))
        throw Error('Metadados do Convex não comprovam o destino de produção.');
      return value;
    }
    metadata();
    function assertOnline() {
      const status = parseReleaseStatus(call('operations:status'));
      if (status.paused || status.emergency)
        throw Error('Há uma manutenção ativa. Reconcilie-a antes da release.');
    }
    assertOnline();
    const owner = git(
      'commit-tree',
      `${commit}^{tree}`,
      '-p',
      commit,
      '-m',
      `Release ${commit}; owner ${randomUUID()}`,
    );
    console.log(`Reserva exclusiva: ${lockRef} (${owner}).`);
    try {
      run('git', ['push', `--force-with-lease=${lockRef}:`, 'origin', `${owner}:${lockRef}`]);
    } catch {
      throw Error(
        `Reserva sem confirmação. Confira ${lockRef} e o proprietário ${owner} antes de repetir.`,
      );
    }
    lock = owner;
    await platform.assertCurrent(previous);
    await platform.keepDomainsManual();
    assertCode(commit);
    run('git', ['push', 'origin', `${commit}:refs/heads/${branch}`]);
    const candidate = await platform.stage(commit);
    console.log(
      `Candidato Production READY: ${candidate.id}, ${candidate.url}. Anterior: ${previous.id}.`,
    );
    assertCode(commit);
    assertOnline();
    await platform.assertCurrent(previous);
    if (backend) {
      const backup = await backupProduction(root, commit, previous.commit, (path) =>
        run(
          process.execPath,
          [convexCli, 'export', '--env-file', targetFile, '--path', path, '--include-file-storage'],
          env,
        ),
      );
      console.log(`Backup privado com Storage conferido: ${backup}.`);
    }
    backendAttempted = true;
    run(
      process.execPath,
      [
        convexCli,
        'deploy',
        '--env-file',
        targetFile,
        '--yes',
        '--codegen',
        'disable',
        '--cmd',
        'node --import tsx scripts/assert-production-target.ts',
        '--cmd-url-env-var-name',
        'DENTEC_DEPLOYMENT_URL',
        '--message',
        `release ${commit}`,
      ],
      env,
    );
    if (metadata().functions.some((fn) => fn.identifier === 'migrations.js:start')) {
      call('migrations:start');
      const migrated = await waitForMigrations(() => JSON.parse(call('migrations:status')));
      if (!migrated.length) console.log('Nenhuma migração pendente.');
      for (const { name, processed } of migrated)
        console.log(`Migração ${name} concluída: ${processed} documentos.`);
    }
    assertCode(commit);
    assertOnline();
    promotionAttempted = true;
    await platform.promote(candidate, previous);
    completed = true;
    console.log(`Release ${commit.slice(0, 8)} confirmada em produção. Anterior: ${previous.id}.`);
  }
} catch (error) {
  console.error(
    error instanceof Error && !('stderr' in error)
      ? error.message
      : 'Uma operação da release falhou. Confira os registros e os destinos.',
  );
  console.error(
    promotionAttempted
      ? 'A promoção pode ter ocorrido. Confira o domínio e o backend antes de repetir.'
      : backendAttempted
        ? 'O backend pode ter sido publicado; o candidato não foi promovido. Depois de conferir, libere a reserva e repita a release: as migrações retomam de onde pararam.'
        : 'Este comando não tentou publicar o backend nem promover o candidato.',
  );
  process.exitCode = 1;
} finally {
  if (lock && completed) {
    try {
      run('git', ['push', `--force-with-lease=${lockRef}:${lock}`, 'origin', `:${lockRef}`]);
    } catch {
      console.error(`Release concluída, mas a reserva ${lockRef} precisa ser reconciliada.`);
      process.exitCode = 1;
    }
  } else if (lock)
    console.error(
      `Reserva preservada em ${lockRef} (${lock}). Confira domínio e backend antes de removê-la com force-with-lease.`,
    );
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  if (snapshot) {
    try {
      snapshot.dispose();
    } catch {
      console.error(`Não foi possível remover o checkout temporário ${snapshot.directory}.`);
      process.exitCode = 1;
    }
  }
}
