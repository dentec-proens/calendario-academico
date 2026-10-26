import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environments } from '../config/environments.ts';
import { assertNoTargetOverrides, convexCli, root } from './environment.ts';
import { parseReleaseStatus, waitForDrain, waitForFrontend } from './release-coordination.ts';
import { inspectScheduledFunctions } from './release-scheduled.ts';
import { releaseSmokeConfiguration } from './release-smoke-config.ts';

const args = process.argv.slice(2);
const dryRun = args.length === 1 && args[0] === '--dry-run';
const branch = environments.git.branch;

function git(...values: string[]): string {
  return execFileSync('git', values, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function run(command: string, values: string[], env = process.env): void {
  const result = spawnSync(command, values, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`Falhou: ${command} ${values[0] ?? ''}. Publicação interrompida.`);
}
function runChecks(): void {
  // Corepack pode fornecer pnpm em JS ou como binário nativo. No Windows,
  // wrappers .cmd exigem cmd.exe; não use shell para argumentos variáveis.
  const manager = process.env.npm_execpath;
  if (manager && /\.(?:c|m)?js$/i.test(manager)) run(process.execPath, [manager, 'check']);
  else if (process.platform === 'win32' && (!manager || /\.(?:cmd|bat)$/i.test(manager)))
    run('cmd.exe', ['/d', '/s', '/c', 'pnpm check']);
  else run(manager || 'pnpm', ['check']);
}
function assertClean(): void {
  if (git('status', '--porcelain'))
    throw Error('Faça commit das alterações e dos arquivos novos antes de publicar.');
  if (git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'convex'))
    throw Error('Mova os arquivos ignorados de convex/ para fora da pasta antes de publicar.');
}
function assertUnchanged(commit: string): void {
  assertClean();
  if (git('branch', '--show-current') !== branch || git('rev-parse', 'HEAD') !== commit)
    throw Error('A branch ou o commit mudou durante a publicação.');
}
function assertOrigin(): void {
  const urls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n');
  const expected = environments.git.repository;
  if (
    urls.length !== 1 ||
    ![
      `https://github.com/${expected}.git`,
      `https://github.com/${expected}`,
      `git@github.com:${expected}.git`,
      `ssh://git@github.com/${expected}.git`,
    ].includes(urls[0]!)
  )
    throw Error(`origin precisa apontar para github.com/${expected}.`);
}

let temporary: string | undefined;
let backendPublished = false;
let backendAttempted = false;
let maintenanceEntered = false;
let pauseAttempted = false;
try {
  if (args.length && !dryRun) throw Error('Uso: pnpm deploy:production [--dry-run]');
  assertNoTargetOverrides(process.env);
  console.log(`Produção Convex: ${environments.production.deployment}`);
  console.log(
    `Produção Vercel: ${environments.vercel.team}/${environments.vercel.project} via origin/${branch}`,
  );
  console.log(
    'Ordem: conferir main → pnpm check → manutenção/drenagem → Convex → push → confirmar Vercel → liberar acesso.',
  );
  if (dryRun) {
    console.log('Simulação: nenhum comando, conexão remota ou arquivo de ambiente foi alterado.');
  } else {
    if (git('branch', '--show-current') !== branch)
      throw Error(`Publique a partir da branch ${branch}.`);
    assertOrigin();
    assertClean();
    const commit = git('rev-parse', 'HEAD');
    run('git', ['fetch', '--no-tags', 'origin', branch]);
    const alreadyPublished = git('rev-parse', `origin/${branch}`) === commit;
    run('git', ['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD']);
    // Falha de acesso ou push não fast-forward deve aparecer antes de alterar o backend.
    run('git', ['push', '--dry-run', 'origin', `HEAD:refs/heads/${branch}`]);
    runChecks();
    assertUnchanged(commit);
    const env = {
      ...process.env,
      CONVEX_DEPLOYMENT: `prod:${environments.production.deployment}`,
      VITE_CONVEX_URL: environments.production.url,
      VITE_CONVEX_SITE_URL: environments.production.siteUrl,
    };
    temporary = mkdtempSync(join(tmpdir(), 'calendario-release-'));
    const targetFile = join(temporary, 'production.env');
    writeFileSync(targetFile, `CONVEX_DEPLOYMENT=prod:${environments.production.deployment}\n`, {
      mode: 0o600,
    });
    const token = process.env.VERCEL_TOKEN;
    if (!token)
      throw Error('Configure VERCEL_TOKEN para confirmar o deployment antes de liberar o acesso.');
    const smoke = releaseSmokeConfiguration();
    function control(name: string, values: Record<string, unknown> = {}): string {
      const result = spawnSync(
        process.execPath,
        [
          convexCli,
          'run',
          `operations:${name}`,
          JSON.stringify(values),
          '--env-file',
          targetFile,
          '--codegen',
          'disable',
        ],
        { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      if (result.error || result.status !== 0)
        throw Error(
          'O controle operacional do Convex não confirmou a operação. Confira operations:status antes de repetir. O deployment precisa ter o controle de admissão e drenagem instalado antes do corte.',
        );
      return result.stdout.trim();
    }
    // Verify the protocol before publishing. A destination without admission
    // tracking needs a separate, proven operational preparation; do not infer
    // drainage from elapsed time or sparse platform metrics.
    const initialStatus = parseReleaseStatus(control('status'));
    if (initialStatus.emergency)
      throw Error(
        'O bloqueio emergencial está ativo. Confira DENTEC_MAINTENANCE antes de publicar.',
      );
    if (alreadyPublished && !(initialStatus.paused && initialStatus.commit === commit))
      throw Error(
        'O commit já está em origin/main sem uma janela de manutenção do mesmo SHA. Confira os artefatos antes de continuar.',
      );
    control('smokePreflight', {
      userId: smoke.userId,
      email: smoke.email,
      calendarId: smoke.calendarId,
    });
    run(process.execPath, ['--import', 'tsx', 'scripts/release-smoke.ts', '--check-browser'], env);
    const inspectJobs = (authoritative: boolean) =>
      inspectScheduledFunctions(
        (cursor) => control('scheduledPage', { paginationOpts: { numItems: 100, cursor } }),
        authoritative,
      );
    inspectJobs(false);
    pauseAttempted = true;
    control('pause', { commit });
    maintenanceEntered = true;
    await waitForDrain(commit, () => parseReleaseStatus(control('status')));
    inspectJobs(true);
    assertUnchanged(commit);
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
        `main ${commit}`,
      ],
      env,
    );
    backendPublished = true;
    run(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/prepare-pdf-runtime.ts',
        '--production',
        '--env-file',
        targetFile,
      ],
      env,
    );
    assertUnchanged(commit);
    // Enviar o SHA conferido evita publicar um commit diferente por uma troca local de branch.
    run('git', ['push', 'origin', `${commit}:refs/heads/${branch}`]);
    await waitForFrontend(
      commit,
      { ...environments.vercel, portalUrl: environments.production.portalUrl },
      token,
    );
    let smokeFailure: { cause: unknown } | undefined;
    try {
      control('authorizeSmoke', { commit, userId: smoke.userId });
      run(process.execPath, ['--import', 'tsx', 'scripts/release-smoke.ts'], env);
    } catch (cause) {
      smokeFailure = { cause };
    } finally {
      try {
        control('endSmoke', { commit });
      } catch (cause) {
        console.error(
          'Não foi possível confirmar a revogação da permissão operacional. Confira operations:endSmoke; a conta restrita pode continuar autorizada durante a manutenção.',
        );
        smokeFailure ??= { cause };
      }
    }
    if (smokeFailure) throw smokeFailure.cause;
    assertUnchanged(commit);
    const finalStatus = parseReleaseStatus(control('status'));
    if (!finalStatus.paused || finalStatus.commit !== commit || finalStatus.active.length !== 0)
      throw Error('A drenagem não permaneceu válida durante a publicação.');
    control('resume', { commit });
    maintenanceEntered = false;
    pauseAttempted = false;
    console.log(`Convex e portal confirmados no commit ${commit.slice(0, 8)}. Acesso liberado.`);
    console.log('Recarregue as abas abertas antes de continuar.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível publicar.');
  if (maintenanceEntered)
    console.error(
      'A manutenção permanece ativa. Confira operações pendentes e recupere backend e frontend da mesma revisão antes de liberar o acesso.',
    );
  else if (pauseAttempted)
    console.error(
      'A manutenção pode estar ativa apesar da falha da CLI. Confira operations:status antes de repetir.',
    );
  if (backendPublished)
    console.error(
      'O Convex já foi publicado; confirme o deployment do portal antes de retomar a publicação.',
    );
  else if (backendAttempted)
    console.error(
      'A tentativa de publicação no Convex falhou. Confira o estado no dashboard antes de repetir: uma falha de conexão pode ocorrer após o envio.',
    );
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
