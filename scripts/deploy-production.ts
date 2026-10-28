import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environments } from '../config/environments.ts';
import { assertNoTargetOverrides, convexCli, root } from './environment.ts';
import { parseReleaseStatus } from './release-coordination.ts';
import { productionCandidates } from './release-candidate.ts';
import { randomUUID } from 'node:crypto';
import { releaseSmokeConfiguration } from './release-smoke-config.ts';
import {
  backupForMigration,
  changesBackend,
  inspectBackend,
  migrateAndVerify,
} from './release-backend.ts';
import { assertRemoteFunctions, fingerprint } from './release-contracts.ts';
import type { Doc } from '../convex/_generated/dataModel.js';

const args = process.argv.slice(2);
const dryRun = args.length === 1 && args[0] === '--dry-run';
const resume = args.length === 1 && args[0] === '--resume';
const contract =
  (args.length === 2 || (args.length === 3 && args[2] === '--resume')) &&
  args[0] === '--contract-manual-sources'
    ? args[1]
    : undefined;
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
let lock: string | undefined;
let completed = false;
let promotionAttempted = false;
let closeSession: (() => void) | undefined;
const lockRef = 'refs/heads/codex/production-release-lock';
try {
  if (args.length && !dryRun && !resume && !contract)
    throw Error(
      'Uso: pnpm deploy:production [--dry-run|--resume|--contract-manual-sources DIRETORIO [--resume]]',
    );
  assertNoTargetOverrides(process.env);
  console.log(`Produção Convex: ${environments.production.deployment}`);
  console.log(
    'Ordem: conferir código → validar compatibilidade → candidato sem domínio público → smoke → promover.',
  );
  if (contract) {
    const { contractManualSources } = await import('./release-manual-source-contract.ts');
    await contractManualSources(
      contract,
      { check: runChecks, clean: assertClean, origin: assertOrigin, unchanged: assertUnchanged },
      args.length === 3,
    );
  } else if (dryRun) {
    console.log('Simulação: nenhum comando, conexão remota ou arquivo de ambiente foi alterado.');
  } else {
    if (git('branch', '--show-current') !== branch) throw Error(`Publique pela branch ${branch}.`);
    assertOrigin();
    assertClean();
    const commit = git('rev-parse', 'HEAD');
    run('git', ['fetch', '--no-tags', 'origin', branch]);
    run('git', ['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD']);
    run('git', ['push', '--dry-run', 'origin', `HEAD:refs/heads/${branch}`]);
    runChecks();
    assertUnchanged(commit);
    const token = process.env.VERCEL_TOKEN;
    if (!token) throw Error('Configure VERCEL_TOKEN antes da release.');
    const smoke = releaseSmokeConfiguration();
    const platform = productionCandidates(token);
    const previous = await platform.current();
    run('git', ['merge-base', '--is-ancestor', previous.commit, commit]);
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
        { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim();
    }
    const control = (name: string, values: Record<string, unknown> = {}) =>
      call(`operations:${name}`, values);
    function metadata() {
      return JSON.parse(
        execFileSync(process.execPath, [convexCli, 'function-spec', '--env-file', targetFile], {
          cwd: root,
          env,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ) as { url: string; functions: Array<{ identifier?: string }> };
    }
    const remote = metadata();
    const installed = remote.functions.some((fn) => fn.identifier === 'releases.js:installed')
      ? 'releases:installed'
      : 'releases:status';
    const installedReceipt = remote.functions.some((fn) => fn.identifier === 'releases.js:status')
      ? (JSON.parse(call(installed) || 'null') as Doc<'releaseProgress'> | null)
      : null;
    if (installedReceipt && 'mode' in installedReceipt) {
      if (installedReceipt.phase !== 'complete')
        throw Error(
          'Fast release pendente exige reconciliação manual; --resume retoma somente a release normal.',
        );
      if (resume)
        throw Error(
          'Fast release já concluída. Para uma nova release normal, execute sem --resume.',
        );
    }
    const receipt = installedReceipt && !('mode' in installedReceipt) ? installedReceipt : null;
    if (receipt && receipt.phase !== 'complete' && (!resume || receipt.commit !== commit))
      throw Error('Há uma expansão pendente. Retome o mesmo commit com --resume.');
    if (resume && (!receipt || receipt.phase === 'complete' || receipt.commit !== commit))
      throw Error('Não há expansão deste commit para retomar.');
    const backendCommit = resume
      ? receipt!.previousBackend
      : (installedReceipt?.commit ?? process.env.DENTEC_RELEASE_BACKEND_COMMIT);
    if (!backendCommit || !/^[a-f0-9]{40}$/.test(backendCommit))
      throw Error('Configure DENTEC_RELEASE_BACKEND_COMMIT com o SHA comprovado para o bootstrap.');
    function assertOnline() {
      const status = parseReleaseStatus(control('status'));
      if (status.paused || status.emergency)
        throw Error('Há uma manutenção ativa. Reconcilie-a antes da release online.');
      if (!installedReceipt && status.commit !== backendCommit)
        throw Error('O registro operacional diverge do recibo de bootstrap.');
    }
    assertOnline();
    run('git', ['merge-base', '--is-ancestor', backendCommit, commit]);
    const paths = git('diff', '--no-renames', '--name-only', backendCommit, commit, '--')
      .split('\n')
      .filter(Boolean);
    const expansion = changesBackend(paths)
      ? await inspectBackend(root, backendCommit, paths, remote, resume)
      : null;
    if (
      resume &&
      (!expansion ||
        receipt!.planHash !== expansion.planHash ||
        receipt!.contractHash !== expansion.contractHash)
    )
      throw Error('Código ou plano divergente da expansão pendente.');
    control('smokePreflight', {
      userId: smoke.userId,
      email: smoke.email,
      calendarId: smoke.calendarId,
    });
    run(process.execPath, ['--import', 'tsx', 'scripts/release-smoke.ts', '--check-browser'], env);
    // The empty expected value atomically creates a reservation. Resume replaces
    // only the exact previous owner, which is also checked by Convex mutations.
    const owner = git(
      'commit-tree',
      `${commit}^{tree}`,
      '-p',
      commit,
      '-m',
      `Release ${commit}; owner ${randomUUID()}`,
    );
    const expectedOwner = resume ? receipt!.owner : '';
    console.log(`Reserva exclusiva: ${lockRef} (${owner}).`);
    try {
      run('git', [
        'push',
        `--force-with-lease=${lockRef}:${expectedOwner}`,
        'origin',
        `${owner}:${lockRef}`,
      ]);
    } catch {
      throw Error(
        `Não foi possível confirmar a reserva. Confira ${lockRef}; uma resposta perdida pode ter reservado ${owner}. Não remova a reserva de outra release.`,
      );
    }
    lock = owner;
    const previousFrontend = resume
      ? await platform.deployment(receipt!.previousFrontend)
      : previous;
    if (resume && previous.id !== previousFrontend.id && previous.id !== receipt!.candidateId)
      throw Error('O domínio diverge dos dois deployments da release pendente.');
    if (!resume) await platform.assertCurrent(previous);
    await platform.keepDomainsManual();
    assertUnchanged(commit);
    run('git', ['push', 'origin', `${commit}:refs/heads/${branch}`]);
    const candidate =
      resume && receipt!.candidateId
        ? await platform.deployment(receipt!.candidateId)
        : await platform.stage(commit);
    if (candidate.commit !== commit) throw Error('O candidato não pertence ao commit retomado.');
    console.log(`Candidato: ${candidate.id}, ${candidate.url}.`);
    const sessionFile = join(temporary, 'session.json');
    if (expansion) {
      closeSession = () =>
        run(
          process.execPath,
          ['--import', 'tsx', 'scripts/release-session-probe.ts', 'finish', sessionFile],
          env,
        );
      run(
        process.execPath,
        ['--import', 'tsx', 'scripts/release-session-probe.ts', 'start', sessionFile],
        env,
      );
      assertOnline();
      if (!resume) {
        if (expansion.plan.migrations.length) {
          const backup = await backupForMigration(root, commit, backendCommit, (path) =>
            run(
              process.execPath,
              [
                convexCli,
                'export',
                '--env-file',
                targetFile,
                '--path',
                path,
                '--include-file-storage',
              ],
              env,
            ),
          );
          console.log(`Backup privado com Storage conferido: ${backup}.`);
        }
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
            `expand ${commit}`,
          ],
          env,
        );
      }
      assertRemoteFunctions(metadata(), expansion.after, environments.production.url);
      call('releases:begin', {
        commit,
        previousBackend: backendCommit,
        previousFrontend: previousFrontend.id,
        owner,
        ...(resume ? { previousOwner: receipt!.owner } : {}),
        contractHash: expansion.contractHash,
        planHash: expansion.planHash,
        plan: expansion.plan,
      });
      run(
        process.execPath,
        ['--import', 'tsx', 'scripts/release-session-probe.ts', 'verify', sessionFile],
        env,
      );
      await migrateAndVerify(
        expansion.plan,
        (id, verify) =>
          JSON.parse(call('releases:batch', { owner, id, verify })) as {
            done: boolean;
            count: number;
          },
      );
      // Validate the actual previous frontend against expanded/migrated data,
      // including when an ambiguous prior promotion has already switched aliases.
      run(process.execPath, ['--import', 'tsx', 'scripts/release-smoke.ts'], {
        ...env,
        DENTEC_RELEASE_CANDIDATE_URL: previousFrontend.url,
      });
    }
    run(process.execPath, ['--import', 'tsx', 'scripts/release-smoke.ts'], {
      ...env,
      DENTEC_RELEASE_CANDIDATE_URL: candidate.url,
    });
    assertUnchanged(commit);
    assertOnline();
    if (!expansion && fingerprint(metadata()) !== fingerprint(remote))
      throw Error('Os contratos do backend mudaram durante a validação.');
    if (expansion) {
      assertRemoteFunctions(metadata(), expansion.after, environments.production.url);
      const current = JSON.parse(call('releases:status')) as Doc<'releaseProgress'>;
      if (
        'mode' in current ||
        current.owner !== owner ||
        current.commit !== commit ||
        current.planHash !== fingerprint(expansion.plan)
      )
        throw Error('A reserva ou o plano do backend mudou.');
      run(
        process.execPath,
        ['--import', 'tsx', 'scripts/release-session-probe.ts', 'verify', sessionFile],
        env,
      );
      call('releases:validated', { owner, candidateId: candidate.id });
    }
    if (previous.id !== candidate.id) {
      await platform.assertCurrent(previousFrontend);
      promotionAttempted = true;
      await platform.promote(candidate, previousFrontend);
    } else await platform.assertCurrent(candidate);
    if (expansion) {
      run(
        process.execPath,
        ['--import', 'tsx', 'scripts/release-session-probe.ts', 'verify', sessionFile],
        env,
      );
      call('releases:complete', { owner, candidateId: candidate.id });
    }
    completed = true;
    console.log(
      `Release ${commit.slice(0, 8)} confirmada. Deployment anterior para recuperação: ${previous.id}.`,
    );
  }
} catch (error) {
  // Child-process errors may contain credentials in stderr; do not dump them.
  console.error(
    error instanceof Error && !('stderr' in error)
      ? error.message
      : 'Uma operação da release falhou. Confira os registros locais e os destinos.',
  );
  console.error(
    promotionAttempted
      ? 'A promoção pode ter ocorrido. Confira o deployment no domínio público antes de repetir; não restaure dados nem o backend automaticamente.'
      : 'A release não promoveu o candidato. Confira o domínio público antes de recuperar uma operação ambígua.',
  );
  process.exitCode = 1;
} finally {
  if (closeSession)
    try {
      closeSession();
    } catch {
      console.error(
        'Não foi possível encerrar a sessão operacional de conferência. As demais sessões foram preservadas.',
      );
      process.exitCode = 1;
    }
  if (lock && completed) {
    try {
      run('git', ['push', `--force-with-lease=${lockRef}:${lock}`, 'origin', `:${lockRef}`]);
    } catch {
      console.error(`Release concluída, mas a reserva ${lockRef} precisa ser reconciliada.`);
      process.exitCode = 1;
    }
  } else if (lock)
    console.error(
      `Reserva preservada em ${lockRef} (${lock}). Confira candidato, backend e domínio antes de removê-la com force-with-lease.`,
    );
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
