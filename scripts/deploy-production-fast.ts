import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environments } from '../config/environments.ts';
import type { Doc } from '../convex/_generated/dataModel.js';
import { assertPlan } from '../convex/releases/plan.ts';
import type { ReleasePlan } from '../convex/releases/plan.ts';
import { assertNoTargetOverrides, convexCli, root } from './environment.ts';
import { productionCandidates } from './release-candidate.ts';
import { parseReleaseStatus } from './release-coordination.ts';
import { fingerprint } from './release-contracts.ts';

const args = process.argv.slice(2);
const dryRun = args.length === 1 && args[0] === '--dry-run';
const branch = environments.git.branch;
const lockRef = 'refs/heads/codex/production-release-lock';
function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`Falhou: ${command} ${args[0] ?? ''}. Fast release interrompida.`);
}
function assertCode(commit?: string) {
  if (git('branch', '--show-current') !== branch) throw Error(`Publique pela branch ${branch}.`);
  if (git('status', '--porcelain')) throw Error('Faça commit das alterações antes de publicar.');
  if (git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'convex'))
    throw Error('Mova os arquivos ignorados de convex/ para fora da pasta antes de publicar.');
  if (commit && git('rev-parse', 'HEAD') !== commit)
    throw Error('O commit mudou durante a publicação.');
}
function assertOrigin() {
  const urls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n');
  const repository = environments.git.repository;
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
let lock: string | undefined;
let completed = false;
let backendAttempted = false;
let promotionAttempted = false;
try {
  if (args.length && !dryRun) throw Error('Uso: pnpm deploy:production:fast [--dry-run]');
  assertNoTargetOverrides(process.env);
  console.log(
    `FAST RELEASE — Convex ${environments.production.deployment}; Vercel ${environments.vercel.team}/${environments.vercel.project}.`,
  );
  console.log(
    'Sem pnpm check, testes, smoke, comparação de compatibilidade ou backup. Typecheck do Convex preservado.',
  );
  if (dryRun) {
    console.log(
      'Ordem: conferir destinos/commit e reservar → build Production Vercel → deploy Convex → promover → registrar.',
    );
    console.log('Simulação: nenhum comando, conexão remota ou arquivo de ambiente foi alterado.');
  } else {
    assertCode();
    assertOrigin();
    const commit = git('rev-parse', 'HEAD');
    const plan = JSON.parse(readFileSync(join(root, 'release/plan.json'), 'utf8')) as ReleasePlan;
    assertPlan(plan);
    if (plan.migrations.length)
      throw Error('Migrações exigem pnpm deploy:production com backup e verificação.');
    const token = process.env.VERCEL_TOKEN;
    if (!token) throw Error('Configure VERCEL_TOKEN antes da release.');
    run('git', ['fetch', '--no-tags', 'origin', branch]);
    run('git', ['merge-base', '--is-ancestor', `origin/${branch}`, commit]);
    const platform = productionCandidates(token);
    const previous = await platform.current();
    run('git', ['merge-base', '--is-ancestor', previous.commit, commit]);
    temporary = mkdtempSync(join(tmpdir(), 'calendario-fast-release-'));
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
          cwd: root,
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim();
    }
    function metadata() {
      const value = JSON.parse(
        execFileSync(process.execPath, [convexCli, 'function-spec', '--env-file', targetFile], {
          cwd: root,
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
    const remote = metadata();
    const installedFunction = remote.functions.some(
      (fn) => fn.identifier === 'releases.js:installed',
    )
      ? 'releases:installed'
      : 'releases:status';
    const receipt = remote.functions.some((fn) => fn.identifier === 'releases.js:status')
      ? (JSON.parse(call(installedFunction) || 'null') as Doc<'releaseProgress'> | null)
      : null;
    if (receipt && receipt.phase !== 'complete')
      throw Error('Há uma release pendente. Reconcilie a publicação antes da fast release.');
    const backendCommit = receipt?.commit ?? process.env.DENTEC_RELEASE_BACKEND_COMMIT;
    if (!backendCommit || !/^[a-f0-9]{40}$/.test(backendCommit))
      throw Error('Configure DENTEC_RELEASE_BACKEND_COMMIT com o SHA comprovado para o bootstrap.');
    run('git', ['merge-base', '--is-ancestor', backendCommit, commit]);
    function assertOnline() {
      const status = parseReleaseStatus(call('operations:status'));
      if (status.paused || status.emergency)
        throw Error('Há uma manutenção ativa. Reconcilie-a antes da fast release.');
      if (!receipt && status.commit !== backendCommit)
        throw Error('O registro operacional diverge do recibo de bootstrap.');
    }
    assertOnline();
    const owner = git(
      'commit-tree',
      `${commit}^{tree}`,
      '-p',
      commit,
      '-m',
      `Fast release ${commit}; owner ${randomUUID()}`,
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
        `fast ${commit}`,
      ],
      env,
    );
    const published = metadata();
    call('releases:fastPublished', {
      commit,
      previousBackend: backendCommit,
      previousFrontend: previous.id,
      owner,
      candidateId: candidate.id,
      functionSpecHash: fingerprint(published),
      plan,
    });
    assertCode(commit);
    assertOnline();
    const current = JSON.parse(call('releases:installed')) as Doc<'releaseProgress'> | null;
    if (
      !current ||
      !('mode' in current) ||
      current.phase !== 'published' ||
      current.owner !== owner ||
      current.commit !== commit ||
      current.candidateId !== candidate.id
    )
      throw Error('O recibo ou a reserva da fast release mudou antes da promoção.');
    promotionAttempted = true;
    await platform.promote(candidate, previous);
    call('releases:fastComplete', { owner, candidateId: candidate.id });
    completed = true;
    console.log(
      `Fast release ${commit.slice(0, 8)} confirmada em produção. Validações omitidas registradas no recibo.`,
    );
  }
} catch (error) {
  console.error(
    error instanceof Error && !('stderr' in error)
      ? error.message
      : 'Uma operação da fast release falhou. Confira os registros e os destinos.',
  );
  console.error(
    promotionAttempted
      ? 'A promoção pode ter ocorrido. Confira domínio, backend e recibo antes de repetir.'
      : backendAttempted
        ? 'O backend pode ter sido publicado; o candidato não foi promovido por este comando. Reconcilie os dois serviços.'
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
      `Reserva preservada em ${lockRef} (${lock}). Reconcilie a publicação antes de removê-la com force-with-lease.`,
    );
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
