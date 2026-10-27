import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { environments } from '../config/environments.ts';
import { root, convexCli } from './environment.ts';
import { productionCandidates } from './release-candidate.ts';
import { parseReleaseStatus, waitForDrain } from './release-coordination.ts';
import { inspectScheduledFunctions } from './release-scheduled.ts';
import { assertRemoteFunctions, fingerprint } from './release-contracts.ts';
import type { Contracts } from './release-contracts.ts';
import { assertHistoryRetirement } from './release-retirement-policy.ts';
import { cli, fileDigest, readSnapshot, save, schemaDigest } from './migrate-data.ts';
import { assertPlan } from '../migration/plan.ts';
import type { MigrationPlan } from '../migration/types.ts';
import { releaseSmokeConfiguration } from './release-smoke-config.ts';

type Checks = { check(): void; clean(): void; origin(): void; unchanged(commit: string): void };

export function assertRetirementReceipt(
  plan: MigrationPlan,
  receipt: Record<string, unknown>,
  schema: string,
) {
  assertPlan(plan);
  if (
    plan.purpose !== 'retire-previous-calendars' ||
    receipt.result !== 'verified' ||
    receipt.verificationMode !== 'live_export' ||
    receipt.planDigest !== plan.digest ||
    receipt.sourceDigest !== plan.sourceDigest ||
    receipt.schemaDigest !== schema ||
    receipt.deployment !== 'local'
  )
    throw Error('A retirada exige ensaio local verificado deste plano e schema.');
}

/** Planned maintenance contract step, restricted to retiring previous calendars. */
export async function retireProduction(path: string, checks: Checks) {
  const directory = realpathSync(resolve(path));
  if (!directory.startsWith(join(realpathSync(root), 'backup-')))
    throw Error('Use um diretório privado backup-* dentro do workspace.');
  chmodSync(directory, 0o700);
  const project = join(directory, 'rehearsal');
  const initial = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')) as MigrationPlan;
  const rehearsal = JSON.parse(readFileSync(join(directory, 'rehearsal-receipt.json'), 'utf8'));
  assertRetirementReceipt(initial, rehearsal, schemaDigest());
  checks.origin();
  checks.clean();
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const commit = git('rev-parse', 'HEAD');
  if (git('branch', '--show-current') !== environments.git.branch)
    throw Error('Publique pela main.');
  if (existsSync(join(directory, 'contract-release.json')))
    throw Error('Já existe uma operação neste diretório. Reconcilie o recibo antes de repetir.');
  const run = (args: string[], env = process.env) => {
    checks.unchanged(commit);
    const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    checks.unchanged(commit);
    if (result.status !== 0 || result.error)
      throw Error('Etapa contract interrompida; confira o journal privado.');
  };
  git('fetch', '--no-tags', 'origin', environments.git.branch);
  git('merge-base', '--is-ancestor', `origin/${environments.git.branch}`, commit);
  git('push', '--dry-run', 'origin', `${commit}:refs/heads/${environments.git.branch}`);
  checks.check();
  checks.unchanged(commit);
  if (!process.env.VERCEL_TOKEN) throw Error('Configure VERCEL_TOKEN.');
  const smoke = releaseSmokeConfiguration();
  checks.unchanged(commit);
  cli(
    ['deploy', '--yes', '--typecheck', 'enable', '--codegen', 'disable', '--deployment', 'local'],
    project,
    true,
  );
  cli(['run', 'migration:status', '{}', '--deployment', 'local'], project);
  const platform = productionCandidates(process.env.VERCEL_TOKEN);
  const previous = await platform.current();
  const target = join(directory, 'production.env');
  writeFileSync(target, `CONVEX_DEPLOYMENT=prod:${environments.production.deployment}\n`, {
    mode: 0o600,
  });
  const prodArgs = ['--env-file', target];
  const call = (name: string, args: Record<string, unknown> = {}) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [convexCli, 'run', name, JSON.stringify(args), ...prodArgs, '--codegen', 'disable'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim() || 'null',
    );
  const metadata = () =>
    JSON.parse(
      execFileSync(process.execPath, [convexCli, 'function-spec', ...prodArgs], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  const installed = call('releases:installed');
  const status = parseReleaseStatus(JSON.stringify(call('operations:status')));
  if (
    !installed ||
    installed.phase !== 'complete' ||
    status.paused ||
    status.emergency ||
    status.active.length
  )
    throw Error('A retirada exige backend concluído, sem manutenção ou actions em andamento.');
  git('merge-base', '--is-ancestor', installed.commit, commit);
  const baseline = join(directory, 'release-baseline');
  mkdirSync(baseline, { mode: 0o700 });
  const archive = execFileSync('git', ['archive', installed.commit], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  const extracted = spawnSync('tar', ['-x', '-C', baseline], { input: archive });
  if (extracted.status !== 0) throw Error('Falha ao extrair baseline.');
  const { symlinkSync } = await import('node:fs');
  symlinkSync(join(root, 'node_modules'), join(baseline, 'node_modules'), 'dir');
  const snapshot = (path: string) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['--import', 'tsx', join(root, 'scripts/release-contract-snapshot.ts'), path],
        {
          cwd: root,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    ) as Contracts;
  const before = snapshot(baseline),
    after = snapshot(root);
  assertHistoryRetirement(before, after);
  const protectedPaths =
    /^(convex\/(auth|access\/|http\.ts|convex\.config\.ts|lib\/maintenance\.ts)|src\/printing\/chromium|config\/|pnpm-lock\.yaml|package\.json|convex\.json|\.npmrc|pnpm-workspace\.yaml)/;
  if (
    git('diff', '--name-only', installed.commit, commit)
      .split('\n')
      .some((path) => protectedPaths.test(path))
  )
    throw Error('A retirada não altera autenticação, destinos, componentes ou dependências.');
  assertRemoteFunctions(metadata(), before, environments.production.url);
  call('operations:smokePreflight', {
    userId: smoke.userId,
    email: smoke.email,
    calendarId: smoke.calendarId,
  });
  run(['--import', 'tsx', 'scripts/release-smoke.ts', '--check-browser']);
  run(['--import', 'tsx', 'scripts/release-smoke.ts'], {
    ...process.env,
    DENTEC_RELEASE_CANDIDATE_URL: previous.url,
  });
  const owner = git(
    'commit-tree',
    `${commit}^{tree}`,
    '-p',
    commit,
    '-m',
    `Contract ${commit}; owner ${randomUUID()}`,
  );
  const lockRef = 'refs/heads/codex/production-release-lock';
  git('push', `--force-with-lease=${lockRef}:`, 'origin', `${owner}:${lockRef}`);
  const journal: Record<string, unknown> = {
    version: 1,
    mode: 'contract',
    commit,
    owner,
    previous,
    previousBackend: installed.commit,
    phase: 'reserved',
  };
  const checkpoint = (phase: string, fields: Record<string, unknown> = {}) => {
    Object.assign(journal, fields, { phase, at: new Date().toISOString() });
    save(join(directory, 'contract-release.json'), journal);
    console.log(`Contract: ${phase}.`);
  };
  checkpoint('reserved');
  let smokeActive = false;
  const sessionFile = join(directory, 'session.json');
  try {
    await platform.assertCurrent(previous);
    await platform.keepDomainsManual();
    checks.unchanged(commit);
    git('push', 'origin', `${commit}:refs/heads/${environments.git.branch}`);
    const candidate = await platform.stage(commit);
    checks.unchanged(commit);
    checkpoint('candidate-ready', { candidate });
    run(['--import', 'tsx', 'scripts/release-session-probe.ts', 'start', sessionFile]);
    checks.unchanged(commit);
    call('operations:pause', { commit });
    await waitForDrain(commit, () => parseReleaseStatus(JSON.stringify(call('operations:status'))));
    inspectScheduledFunctions(
      (cursor) =>
        JSON.stringify(
          call('operations:scheduledPage', { paginationOpts: { numItems: 100, cursor } }),
        ),
      true,
    );
    checkpoint('paused');
    const preMaintenance = join(directory, 'before-maintenance.zip');
    run([convexCli, 'export', ...prodArgs, '--include-file-storage', '--path', preMaintenance]);
    chmodSync(preMaintenance, 0o600);
    readSnapshot(preMaintenance);
    checkpoint('backup-complete', { backupDigest: fileDigest(preMaintenance) });
    const deploymentProject = join(directory, 'production-migration');
    run([
      '--import',
      'tsx',
      'scripts/migrate-data.ts',
      'prepare',
      '--plan',
      join(directory, 'plan.json'),
      '--out',
      deploymentProject,
    ]);
    const deployArgs = [
      convexCli,
      'deploy',
      ...prodArgs,
      '--yes',
      '--codegen',
      'disable',
      '--typecheck',
      'enable',
    ];
    checks.unchanged(commit);
    const temporaryDeploy = spawnSync(process.execPath, deployArgs, {
      cwd: deploymentProject,
      stdio: 'inherit',
    });
    checks.unchanged(commit);
    if (temporaryDeploy.status !== 0)
      throw Error('Deploy de manutenção incerto; mantenha a reserva.');
    checkpoint('migration-backend');
    const frozen = join(directory, 'frozen.zip');
    run([convexCli, 'export', ...prodArgs, '--include-file-storage', '--path', frozen]);
    chmodSync(frozen, 0o600);
    const planPath = join(directory, 'frozen-plan.json');
    run([
      '--import',
      'tsx',
      'scripts/migrate-data.ts',
      'plan',
      '--retire-previous-calendars',
      '--snapshot',
      frozen,
      '--out',
      planPath,
    ]);
    const plan = JSON.parse(readFileSync(planPath, 'utf8')) as MigrationPlan;
    checkpoint('frozen', { planDigest: plan.digest, sourceDigest: plan.sourceDigest });
    // Rehearse the exact frozen production plan, including all bytes and stable IDs.
    checks.unchanged(commit);
    cli(['import', frozen, '--replace-all', '--yes', '--deployment', 'local'], project, true);
    const migration = (command: string, destination: string, extra: string[]) =>
      run([
        '--import',
        'tsx',
        'scripts/migrate-data.ts',
        command,
        '--plan',
        planPath,
        '--deployment',
        destination,
        '--project',
        destination === 'local' ? project : deploymentProject,
        ...extra,
      ]);
    migration('apply', 'local', ['--confirm', plan.digest]);
    const localAfter = join(directory, 'frozen-rehearsal-after.zip'),
      localReceipt = join(directory, 'frozen-rehearsal-receipt.json');
    migration('verify', 'local', ['--snapshot', localAfter, '--out', localReceipt]);
    assertRetirementReceipt(plan, JSON.parse(readFileSync(localReceipt, 'utf8')), schemaDigest());
    checkpoint('frozen-rehearsal-verified', { rehearsalDigest: fileDigest(localReceipt) });
    migration('apply', environments.production.deployment, [
      '--confirm',
      plan.digest,
      '--rehearsal',
      localReceipt,
    ]);
    const productionAfter = join(directory, 'production-after.zip'),
      productionReceipt = join(directory, 'production-receipt.json');
    migration('verify', environments.production.deployment, [
      '--snapshot',
      productionAfter,
      '--out',
      productionReceipt,
    ]);
    checkpoint('data-verified', { verificationDigest: fileDigest(productionReceipt) });
    migration('finish', environments.production.deployment, ['--receipt', productionReceipt]);
    checks.unchanged(commit);
    run([
      ...deployArgs,
      '--cmd',
      'node --import tsx scripts/assert-production-target.ts',
      '--cmd-url-env-var-name',
      'DENTEC_DEPLOYMENT_URL',
      '--message',
      `contract ${commit}`,
    ]);
    assertRemoteFunctions(metadata(), after, environments.production.url);
    run(['--import', 'tsx', 'scripts/release-session-probe.ts', 'verify', sessionFile]);
    call('releases:contractPublished', {
      mode: 'contract',
      key: 'backend',
      commit,
      owner,
      previousBackend: installed.commit,
      previousFrontend: previous.id,
      candidateId: candidate.id,
      functionSpecHash: fingerprint(after),
      planDigest: plan.digest,
      sourceDigest: plan.sourceDigest,
      schemaDigest: schemaDigest(),
      rehearsalDigest: fileDigest(localReceipt),
      verificationDigest: fileDigest(productionReceipt),
      phase: 'published',
      changedAt: Date.now(),
    });
    checkpoint('backend-published');
    await recoverExpiredFiles(() => call('nativeFiles:cleanupExpired'));
    checkpoint('temporary-callbacks-reconciled');
    // Only the operational account may access the candidate while other writers remain blocked.
    smokeActive = true;
    call('operations:authorizeSmoke', { commit, userId: smoke.userId });
    try {
      run(['--import', 'tsx', 'scripts/release-smoke.ts'], {
        ...process.env,
        DENTEC_RELEASE_CANDIDATE_URL: candidate.url,
      });
    } finally {
      call('operations:endSmoke', { commit });
      smokeActive = false;
    }
    run(['--import', 'tsx', 'scripts/release-session-probe.ts', 'verify', sessionFile]);
    checks.unchanged(commit);
    assertRemoteFunctions(metadata(), after, environments.production.url);
    call('releases:contractValidated', { owner, candidateId: candidate.id });
    checkpoint('validated');
    checks.unchanged(commit);
    await platform.promote(candidate, previous);
    checkpoint('promoted');
    checks.unchanged(commit);
    call('releases:contractComplete', { owner, candidateId: candidate.id });
    run(['--import', 'tsx', 'scripts/release-session-probe.ts', 'finish', sessionFile]);
    checkpoint('resume-attempted');
    call('operations:resume', { commit });
    checkpoint('access-resumed');
    await platform.assertCurrent(candidate);
    const online = parseReleaseStatus(JSON.stringify(call('operations:status'))),
      receipt = call('releases:installed');
    if (
      online.paused ||
      online.emergency ||
      receipt.phase !== 'complete' ||
      receipt.commit !== commit
    )
      throw Error('Conclusão não confirmada.');
    checkpoint('lock-release-attempted');
    git('push', `--force-with-lease=${lockRef}:${owner}`, 'origin', `:${lockRef}`);
    checkpoint('complete');
    console.log(
      `Release completa contract ${commit.slice(0, 8)}: ${environments.production.portalUrl}`,
    );
  } catch (error) {
    if (smokeActive)
      try {
        call('operations:endSmoke', { commit });
      } catch {}
    checkpoint('attention-required', {
      interruptedAfter: journal.phase,
      error:
        error instanceof Error && !('stderr' in error)
          ? error.message
          : 'Operação externa falhou; confira os logs privados.',
    });
    throw Error(
      'A etapa contract foi interrompida. Confira o estado real da manutenção, do domínio e da reserva pelo journal e pelos serviços antes de retomar.',
    );
  }
}

export async function recoverExpiredFiles(cleanup: () => unknown) {
  for (let batch = 0; batch < 1000; batch++) {
    const value = cleanup() as { uploads?: unknown; tickets?: unknown; continued?: unknown } | null;
    if (
      !value ||
      typeof value.continued !== 'boolean' ||
      !Number.isSafeInteger(value.uploads) ||
      !Number.isSafeInteger(value.tickets)
    )
      throw Error('A recuperação dos temporários não retornou checkpoint válido.');
    if (!value.continued) return;
  }
  throw Error('A recuperação dos temporários não concluiu; manutenção preservada.');
}
