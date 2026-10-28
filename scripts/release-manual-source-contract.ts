/** Deliberate, narrowly scoped schema contraction. No calendar/document/data migration is performed. */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { environments } from '../config/environments.ts';
import { root, convexCli } from './environment.ts';
import { productionCandidates } from './release-candidate.ts';
import type { Candidate } from './release-candidate.ts';
import { releaseSmokeConfiguration } from './release-smoke-config.ts';
import { parseReleaseStatus, waitForDrain } from './release-coordination.ts';
import { inspectScheduledFunctions } from './release-scheduled.ts';
import { assertRemoteFunctions } from './release-contracts.ts';
import type { Contracts } from './release-contracts.ts';
import {
  assertManualSourceContraction,
  assertNoManualSources,
} from './release-manual-source-policy.ts';
import { canonical, fingerprint } from './administration/canonical.ts';
import { readSnapshot } from './administration/snapshot.ts';
import type { Snapshot } from './administration/snapshot.ts';
import {
  createPresenceManifest,
  reconcilePresence,
  presenceNamespaces,
} from './administration/presence-lifecycle.ts';
import { assertPresenceRuntime } from './administration/presence-runtime.ts';
import {
  createAuthRefreshManifest,
  reconcileAuthRefresh,
  assertAuthRefreshRuntime,
} from './auth-refresh-reconciliation.ts';
import { withTargetEnvFile } from './administration/cli-environment.ts';

type Checks = { check(): void; clean(): void; origin(): void; unchanged(commit: string): void };
type Phase =
  | 'reserved'
  | 'candidate-ready'
  | 'paused'
  | 'backup-complete'
  | 'rehearsed'
  | 'backend-attempted'
  | 'backend-deployed'
  | 'data-verified'
  | 'published'
  | 'validated'
  | 'promoted'
  | 'complete';
type Journal = {
  version: 1;
  operation: 'manual-source-schema';
  commit: string;
  owner: string;
  previousOwner?: string;
  lockAttemptOwner?: string;
  previousBackend: string;
  previous: Candidate;
  candidate?: Candidate;
  phase: Phase;
  afterHash: string;
  source?: string;
  manifest?: string;
  rehearsal?: string;
  verification?: string;
  error?: string;
};
const phases: Phase[] = [
  'reserved',
  'candidate-ready',
  'paused',
  'backup-complete',
  'rehearsed',
  'backend-attempted',
  'backend-deployed',
  'data-verified',
  'published',
  'validated',
  'promoted',
  'complete',
];
const ref = 'refs/heads/codex/production-release-lock';
export function contractProtectionHeaders(
  candidateUrl: string,
  environment = process.env,
): Record<string, string> {
  const configuration = releaseSmokeConfiguration({
    ...environment,
    DENTEC_RELEASE_CANDIDATE_URL: candidateUrl,
  });
  return configuration.protection
    ? { [configuration.protection.name]: configuration.protection.value }
    : {};
}

export async function promoteContractCandidate(
  platform: Pick<ReturnType<typeof productionCandidates>, 'current' | 'assertCurrent' | 'promote'>,
  candidate: Candidate,
  previous: Candidate,
) {
  const live = await platform.current();
  if (live.id === candidate.id) {
    if (canonical(live) !== canonical(candidate))
      throw Error('A identidade do candidato promovido divergiu.');
    await platform.assertCurrent(candidate);
  } else if (live.id === previous.id) {
    if (canonical(live) !== canonical(previous))
      throw Error('A identidade do deployment anterior divergiu.');
    await platform.promote(candidate, previous);
  } else throw Error('O domínio saiu dos dois deployments conferidos.');
}
const tableHash = (rows: unknown[]) => fingerprint(rows.map(canonical).sort());
export function contractManifest(snapshot: Snapshot, commit: string, schemaDigest: string) {
  return {
    version: 1,
    operation: 'manual-source-schema' as const,
    breaksOldClients: true,
    commit,
    sourceDigest: snapshot.sha256,
    schemaDigest,
    states: assertNoManualSources(snapshot.tables),
    tables: Object.fromEntries(
      Object.entries(snapshot.tables).map(([name, rows]) => [
        name,
        { count: rows.length, hash: tableHash(rows) },
      ]),
    ),
    files: snapshot.files,
    presence: createPresenceManifest(snapshot.tables),
    authRefresh: createAuthRefreshManifest(snapshot.tables),
  };
}
export function verifyContractSnapshot(
  manifest: ReturnType<typeof contractManifest>,
  snapshot: Snapshot,
) {
  assertNoManualSources(snapshot.tables);
  const expected = Object.keys(manifest.tables).sort(),
    actual = Object.keys(snapshot.tables).sort();
  if (canonical(expected) !== canonical(actual))
    throw Error('Namespace alterado durante a contração.');
  for (const [name, entry] of Object.entries(manifest.tables)) {
    if (name === 'authRefreshTokens' || (presenceNamespaces as readonly string[]).includes(name))
      continue;
    if (
      snapshot.tables[name].length !== entry.count ||
      tableHash(snapshot.tables[name]) !== entry.hash
    )
      throw Error(`Dados alterados durante a contração: ${name}.`);
  }
  if (canonical(snapshot.files) !== canonical(manifest.files))
    throw Error('Storage alterado durante a contração.');
  return {
    version: 1,
    operation: manifest.operation,
    planDigest: fingerprint(manifest),
    sourceDigest: manifest.sourceDigest,
    observedDigest: snapshot.sha256,
    states: assertNoManualSources(snapshot.tables),
    presence: reconcilePresence(manifest.presence, snapshot.tables),
    authRefresh: reconcileAuthRefresh(manifest.authRefresh, snapshot.tables),
    result: 'verified' as const,
  };
}
function save(path: string, value: unknown) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}
function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
function privateDirectory(path: string) {
  if (!isAbsolute(path)) throw Error('Use um diretório privado absoluto fora do repositório.');
  const directory = realpathSync(path),
    relation = relative(realpathSync(root), directory);
  if (
    !relation ||
    (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation)) ||
    statSync(directory).mode & 0o077
  )
    throw Error('O diretório precisa ficar fora do repositório com permissão700.');
  return directory;
}

export async function contractManualSources(path: string, checks: Checks, resume = false) {
  const directory = privateDirectory(path),
    journalPath = join(directory, 'contract-release.json');
  checks.origin();
  checks.clean();
  const env = { ...process.env };
  for (const key of [
    'CONVEX_DEPLOYMENT',
    'CONVEX_DEPLOY_KEY',
    'CONVEX_DEPLOYMENT_TOKEN',
    'CONVEX_SELF_HOSTED_URL',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
  ])
    delete env[key];
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const commit = git('rev-parse', 'HEAD');
  if (git('branch', '--show-current') !== environments.git.branch)
    throw Error('Publique pela main.');
  if (resume !== existsSync(journalPath))
    throw Error('Use --resume somente para o journal existente desta operação.');
  const run = (file: string, args: string[], variables = env, cwd = root) => {
    checks.unchanged(commit);
    try {
      return execFileSync(process.execPath, [file, ...args], {
        cwd,
        env: variables,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      }).trim();
    } catch {
      throw Error(
        `Etapa contract falhou (${file === convexCli ? args[0] : 'ferramenta local'}). Preserve journal/reserva e confira os serviços.`,
      );
    }
  };
  const production = (args: string[]) =>
    withTargetEnvFile({ deployment: environments.production.deployment }, (file) =>
      run(convexCli, [...args, '--env-file', file]),
    );
  const call = (name: string, args: unknown = {}) =>
    JSON.parse(
      production(['run', name, JSON.stringify(args), '--codegen', 'disable']) || 'null',
    ) as Record<string, unknown>;
  const status = () => parseReleaseStatus(JSON.stringify(call('operations:status')));
  const metadata = () =>
    JSON.parse(production(['function-spec'])) as { url: string; functions: unknown[] };
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw Error('Configure VERCEL_TOKEN antes de publicar.');
  const smoke = releaseSmokeConfiguration(),
    platform = productionCandidates(token);
  const installed = call('releases:installed');
  let journal = resume ? json<Journal>(journalPath) : undefined;
  if (
    journal &&
    (journal.operation !== 'manual-source-schema' ||
      journal.version !== 1 ||
      journal.commit !== commit ||
      !phases.includes(journal.phase))
  )
    throw Error('Retome exatamente o código e a operação registrados.');
  const baselineCommit = journal?.previousBackend ?? installed.commit;
  if (
    typeof baselineCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(baselineCommit) ||
    (!journal && installed.phase !== 'complete')
  )
    throw Error('O backend precisa ter recibo concluído.');
  git('fetch', '--no-tags', 'origin', environments.git.branch);
  git('merge-base', '--is-ancestor', `origin/${environments.git.branch}`, commit);
  git('merge-base', '--is-ancestor', baselineCommit, commit);
  checks.check();
  checks.unchanged(commit);
  assertPresenceRuntime();
  assertAuthRefreshRuntime();
  const baseline = join(directory, 'baseline');
  const baselineMarker = join(directory, 'baseline-commit.json');
  if (
    existsSync(baseline) &&
    (!existsSync(baselineMarker) ||
      json<{ commit: string }>(baselineMarker).commit !== baselineCommit)
  )
    throw Error('O checkout do baseline não tem identidade confirmada.');
  if (!existsSync(baseline)) {
    mkdirSync(baseline, { mode: 0o700 });
    const archive = execFileSync('git', ['archive', baselineCommit], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    const { extract } = await import('tar-fs');
    const { Readable } = await import('node:stream');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(Readable.from([archive]), extract(baseline));
    const { symlinkSync } = await import('node:fs');
    symlinkSync(join(root, 'node_modules'), join(baseline, 'node_modules'), 'dir');
    save(baselineMarker, { commit: baselineCommit });
  }
  const snapshotContracts = (source: string) =>
    JSON.parse(
      run('--import', ['tsx', join(root, 'scripts/release-contract-snapshot.ts'), source]),
    ) as Contracts;
  const before = snapshotContracts(baseline),
    after = snapshotContracts(root),
    schemaDigest = fingerprint(after.schema);
  assertManualSourceContraction(before, after);
  if (
    git('diff', '--name-only', baselineCommit, commit)
      .split('\n')
      .some((name) =>
        /^(convex\/(auth|access\/|http\.ts|convex\.config\.ts|lib\/maintenance\.ts)|src\/printing\/chromium|config\/|pnpm-lock\.yaml|package\.json|convex\.json|\.npmrc|pnpm-workspace\.yaml)/.test(
          name,
        ),
      )
  )
    throw Error(
      'A contração não altera autenticação, componentes, destinos, dependências ou runtime.',
    );
  const afterHash = fingerprint(after);
  if (journal && journal.afterHash !== afterHash)
    throw Error('Os contratos mudaram desde a reserva.');
  const checkpoint = (phase: Phase, fields: Partial<Journal> = {}) => {
    if (!journal) throw Error('Reserva ausente.');
    Object.assign(journal, fields, { phase, error: undefined });
    save(journalPath, journal);
    console.log(`Contract: ${phase}.`);
  };
  const reached = (phase: Phase) => phases.indexOf(journal!.phase) >= phases.indexOf(phase);
  const current = await platform.current();
  if (!journal) {
    const control = status();
    if (control.paused || control.emergency || control.active.length)
      throw Error('A contração exige ambiente aberto e sem actions ativas antes da reserva.');
    assertRemoteFunctions(metadata(), before, environments.production.url);
    call('operations:smokePreflight', {
      userId: smoke.userId,
      email: smoke.email,
      calendarId: smoke.calendarId,
    });
    run('--import', ['tsx', 'scripts/release-smoke.ts', '--check-browser']);
    const owner = git(
      'commit-tree',
      `${commit}^{tree}`,
      '-p',
      commit,
      '-m',
      `Contract manual-sources ${commit}; owner ${randomUUID()}`,
    );
    journal = {
      version: 1,
      operation: 'manual-source-schema',
      commit,
      owner,
      previousBackend: baselineCommit,
      previous: current,
      phase: 'reserved',
      afterHash,
    };
    save(journalPath, journal);
    git('push', `--force-with-lease=${ref}:`, 'origin', `${owner}:${ref}`);
  } else {
    if (installed.phase === 'complete' && installed.commit === commit) {
      if (installed.owner !== journal.owner || installed.candidateId !== journal.candidate?.id)
        throw Error('Recibo concluído diverge do journal.');
      assertRemoteFunctions(metadata(), after, environments.production.url);
      await platform.assertCurrent(journal.candidate!);
      const control = status();
      if (control.paused) call('operations:resume', { commit });
      const online = status();
      if (online.paused || online.emergency || online.active.length)
        throw Error('A reabertura da operação concluída não foi confirmada.');
      const remoteOwner = git('ls-remote', 'origin', ref).split(/\s/)[0];
      if (remoteOwner && remoteOwner !== journal.owner)
        throw Error('Outra operação possui a reserva; ela não será removida.');
      if (remoteOwner)
        git('push', `--force-with-lease=${ref}:${journal.owner}`, 'origin', `:${ref}`);
      checkpoint('complete');
      return;
    }
    const remoteOwner = git('ls-remote', 'origin', ref).split(/\s/)[0];
    if (remoteOwner !== journal.owner && remoteOwner !== journal.lockAttemptOwner)
      throw Error('A reserva remota não pertence ao journal.');
    const oldOwner = journal.owner,
      owner =
        journal.lockAttemptOwner ??
        git(
          'commit-tree',
          `${commit}^{tree}`,
          '-p',
          commit,
          '-m',
          `Resume contract ${commit}; owner ${randomUUID()}`,
        );
    save(journalPath, { ...journal, lockAttemptOwner: owner });
    if (remoteOwner !== owner)
      git('push', `--force-with-lease=${ref}:${oldOwner}`, 'origin', `${owner}:${ref}`);
    journal.previousOwner = oldOwner;
    journal.owner = owner;
    delete journal.lockAttemptOwner;
    save(journalPath, journal);
    const prior = await platform.deployment(journal.previous.id);
    if (canonical(prior) !== canonical(journal.previous))
      throw Error('O deployment anterior mudou de identidade.');
    if (journal.candidate) {
      const candidate = await platform.deployment(journal.candidate.id);
      if (candidate.commit !== commit || canonical(candidate) !== canonical(journal.candidate))
        throw Error('O candidato retomado não pertence ao código exato.');
    }
    if (current.id !== journal.previous.id && current.id !== journal.candidate?.id)
      throw Error('O domínio saiu dos deployments desta operação.');
  }
  try {
    if (!reached('candidate-ready')) {
      await platform.assertCurrent(journal.previous);
      await platform.keepDomainsManual();
      git('push', 'origin', `${commit}:refs/heads/${environments.git.branch}`);
      const candidate = await platform.stage(commit);
      const response = await fetch(candidate.url, {
        redirect: 'manual',
        headers: contractProtectionHeaders(candidate.url, env),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html'))
        throw Error(
          'O candidato exige autenticação de proteção ou não respondeu HTML; confira OIDC antes da manutenção.',
        );
      checkpoint('candidate-ready', { candidate });
    }
    if (!reached('paused')) {
      call('operations:pause', { commit });
      checkpoint('paused');
    }
    await waitForDrain(commit, status);
    if (resume) call('operations:endSmoke', { commit });
    if (!reached('backup-complete')) {
      inspectScheduledFunctions(
        (cursor) =>
          JSON.stringify(
            call('operations:scheduledPage', { paginationOpts: { cursor, numItems: 100 } }),
          ),
        true,
      );
      const source = join(directory, `source-${Date.now()}.zip`);
      production(['export', '--include-file-storage', '--path', source]);
      chmodSync(source, 0o600);
      const data = readSnapshot(source);
      if ((data.tables.nativeFileTickets?.length ?? 0) || (data.tables.nativeUploads?.length ?? 0))
        throw Error(
          'Aguarde a conclusão dos callbacks de arquivos antes de congelar a cópia definitiva.',
        );
      const manifest = join(directory, 'manifest.json');
      save(manifest, contractManifest(data, commit, schemaDigest));
      checkpoint('backup-complete', { source, manifest });
    }
    const manifest = json<ReturnType<typeof contractManifest>>(journal.manifest!);
    if (
      manifest.commit !== commit ||
      manifest.schemaDigest !== schemaDigest ||
      readSnapshot(journal.source!).sha256 !== manifest.sourceDigest
    )
      throw Error('Backup, código, manifesto ou schema divergente.');
    const rehearsalProject = join(directory, 'rehearsal');
    const config = json<{ deploymentName: string; ports: { cloud: number }; adminKey: string }>(
      join(rehearsalProject, '.convex/local/default/config.json'),
    );
    if (
      !config.deploymentName.startsWith('anonymous-') ||
      !Number.isInteger(config.ports.cloud) ||
      !config.adminKey
    )
      throw Error('O ensaio exige backend local anônimo descartável.');
    const localUrl = `http://127.0.0.1:${config.ports.cloud}`;
    const local = (args: string[]) =>
      withTargetEnvFile({ url: localUrl, adminKey: config.adminKey }, (file) =>
        run(convexCli, [...args, '--env-file', file], env, rehearsalProject),
      );
    for (const name of git(
      'ls-files',
      '--',
      'convex',
      'src',
      'config',
      'package.json',
      'pnpm-lock.yaml',
      'convex.json',
    )
      .split('\n')
      .filter(Boolean)) {
      if (name.startsWith('convex/_generated/')) continue;
      const sourceFile = join(root, name),
        localFile = join(rehearsalProject, name);
      if (!existsSync(localFile) || !readFileSync(sourceFile).equals(readFileSync(localFile)))
        throw Error('O projeto de ensaio não contém o mesmo código backend do commit.');
    }
    const localMetadata = JSON.parse(local(['function-spec']));
    assertRemoteFunctions(localMetadata, after, localUrl);
    const localState = JSON.parse(
      local(['run', 'releases/contract:state', '{}', '--codegen', 'disable']),
    ) as { schemaDigest: string; url: string };
    if (localState.schemaDigest !== schemaDigest || localState.url !== localUrl)
      throw Error('O ensaio não executa o schema final.');
    if (!reached('rehearsed')) {
      local(['import', journal.source!, '--replace', '--yes']);
      const localAfter = join(directory, `rehearsal-after-${Date.now()}.zip`);
      local(['export', '--include-file-storage', '--path', localAfter]);
      chmodSync(localAfter, 0o600);
      const report = verifyContractSnapshot(manifest, readSnapshot(localAfter));
      const restored = readSnapshot(localAfter);
      const content = restored.tables.calendarContents?.[0];
      if (!content)
        throw Error('O ensaio exige um calendário real para comprovar o validator aninhado.');
      const calendar = restored.tables.calendars.find((item) => item._id === content.calendarId);
      const campus = restored.tables.campuses.find((item) => item._id === calendar?.campusId);
      if (!calendar || !campus || !Array.isArray(calendar.modalities))
        throw Error('Vínculos do calendário de ensaio inválidos.');
      const state = structuredClone(content.state) as Record<string, unknown>;
      const modality = String(calendar.modalities[0]);
      const intake = structuredClone(state.intakeByModality ?? {}) as Record<
        string,
        Record<string, Record<string, unknown>>
      >;
      const terms = intake[modality] ?? {},
        term = Object.keys(terms)[0] ?? 'annual';
      intake[modality] = {
        ...terms,
        [term]: { ...(terms[term] ?? { status: 'unknown' }), source: 'retired-field-probe' },
      };
      const body = {
        version: calendar.version,
        catalogueRevision: content.catalogueRevision,
        state: {
          ...state,
          schemaVersion: state.schemaVersion ?? 2,
          year: calendar.year,
          campus: campus.name,
          modalities: calendar.modalities,
          offer: modality,
          intakeByModality: intake,
        },
      };
      let rejected = false;
      withTargetEnvFile({ url: localUrl, adminKey: config.adminKey }, (file) => {
        try {
          execFileSync(
            process.execPath,
            [
              convexCli,
              'run',
              'calendars:saveCalendar',
              JSON.stringify({ id: calendar._id, body }),
              '--env-file',
              file,
              '--codegen',
              'disable',
            ],
            { cwd: rehearsalProject, env, stdio: ['ignore', 'pipe', 'pipe'] },
          );
        } catch (error) {
          const stderr =
            error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
          rejected =
            /ArgumentValidationError/.test(stderr) &&
            /(?:extra|unexpected) field [`'"]?source/i.test(stderr) &&
            /intakeByModality/.test(stderr);
        }
      });
      if (!rejected)
        throw Error(
          'O Convex nativo não comprovou a rejeição do source aninhado antes da autenticação.',
        );

      const oldProjection = join(directory, 'projection-before.json'),
        newProjection = join(directory, 'projection-after.json');
      for (const [codeRoot, out] of [
        [baseline, oldProjection],
        [root, newProjection],
      ])
        run('--import', [
          'tsx',
          'scripts/administration/calendar-projection.ts',
          '--snapshot',
          journal.source!,
          '--code-root',
          codeRoot,
          '--out',
          out,
        ]);
      if (canonical(json(oldProjection)) !== canonical(json(newProjection)))
        throw Error('Contagens, prazos ou classificação mudaram no ensaio.');
      const rehearsal = join(directory, 'rehearsal-receipt.json');
      save(rehearsal, {
        ...report,
        schemaDigest,
        afterHash,
        projectionDigest: fingerprint(json(oldProjection)),
      });
      checkpoint('rehearsed', { rehearsal });
    }
    if (journal.phase === 'backend-attempted')
      throw Error(
        'A tentativa de deploy teve resposta ambígua. Confira o código instalado na plataforma antes de reconciliar o journal; --resume não republica nem presume o backend anterior.',
      );
    if (!reached('backend-deployed')) {
      checkpoint('backend-attempted');
      production([
        'deploy',
        '--yes',
        '--codegen',
        'disable',
        '--typecheck',
        'enable',
        '--cmd',
        'node --import tsx scripts/assert-production-target.ts',
        '--cmd-url-env-var-name',
        'DENTEC_DEPLOYMENT_URL',
        '--message',
        `contract manual-sources ${commit}`,
      ]);
      checkpoint('backend-deployed');
    }
    assertRemoteFunctions(metadata(), after, environments.production.url);
    const actualState = call('releases/contract:state');
    if (
      actualState.schemaDigest !== schemaDigest ||
      actualState.url !== environments.production.url ||
      !actualState.paused ||
      actualState.commit !== commit ||
      actualState.smoke ||
      !actualState.drained
    )
      throw Error('O schema/janela real não corresponde à contração.');
    if (!reached('data-verified')) {
      const afterPath = join(directory, `production-after-${Date.now()}.zip`);
      production(['export', '--include-file-storage', '--path', afterPath]);
      chmodSync(afterPath, 0o600);
      const verification = join(directory, 'production-verification.json');
      save(verification, verifyContractSnapshot(manifest, readSnapshot(afterPath)));
      checkpoint('data-verified', { verification });
    }
    const receiptFields = {
      key: 'backend',
      mode: 'contract',
      phase: 'published',
      commit,
      previousBackend: baselineCommit,
      previousFrontend: journal.previous.id,
      owner: journal.owner,
      candidateId: journal.candidate!.id,
      functionSpecHash: afterHash,
      planDigest: fingerprint(manifest),
      sourceDigest: manifest.sourceDigest,
      schemaDigest,
      rehearsalDigest: fingerprint(json(journal.rehearsal!)),
      verificationDigest: fingerprint(json(journal.verification!)),
      changedAt: Date.now(),
      ...(journal.previousOwner ? { previousOwner: journal.previousOwner } : {}),
    };
    call('releases/contract:published', receiptFields);
    if (!reached('published')) checkpoint('published');
    if (!reached('validated')) {
      try {
        call('operations:authorizeSmoke', { commit, userId: smoke.userId });
        run('--import', ['tsx', 'scripts/release-smoke.ts'], {
          ...env,
          DENTEC_RELEASE_CANDIDATE_URL: journal.candidate!.url,
        });
      } finally {
        call('operations:endSmoke', { commit });
      }
      call('releases/contract:validated', {
        owner: journal.owner,
        candidateId: journal.candidate!.id,
      });
      checkpoint('validated');
    }
    if (!reached('promoted')) {
      await promoteContractCandidate(platform, journal.candidate!, journal.previous);
      checkpoint('promoted');
    }
    await platform.assertCurrent(journal.candidate!);
    call('releases/contract:complete', {
      owner: journal.owner,
      candidateId: journal.candidate!.id,
    });
    call('operations:resume', { commit });
    const online = status(),
      completed = call('releases:installed');
    if (
      online.paused ||
      online.emergency ||
      completed.phase !== 'complete' ||
      completed.commit !== commit ||
      completed.owner !== journal.owner
    )
      throw Error('A conclusão contract não foi confirmada.');
    git('push', `--force-with-lease=${ref}:${journal.owner}`, 'origin', `:${ref}`);
    checkpoint('complete');
    console.log(
      `Contração publicada: ${commit.slice(0, 8)}. Schema sem campos manuais; fontes institucionais preservadas.`,
    );
  } catch (error) {
    journal.error =
      error instanceof Error && !('stderr' in error)
        ? error.message
        : 'Falha externa; conferir serviços e journal privado.';
    save(journalPath, journal);
    console.error(
      `Contrato interrompido na fase ${journal.phase}; reserva ${journal.owner} preservada. Nenhum rollback automático.`,
    );
    throw error;
  }
}
