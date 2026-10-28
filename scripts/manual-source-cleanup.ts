/** One-off administrative cleanup; all artifacts stay private and every write has a native CAS. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import schema from '../convex/schema.ts';
import { withoutManualSources } from '../src/manual-sources.ts';
import { environments } from '../config/environments.ts';
import { assertNoTargetOverrides, convexCli, root } from './environment.ts';
import {
  assertCleanupPlan,
  assertReceipt,
  canonical,
  cleanupTables,
  fingerprint,
  identity,
} from '../convex/maintenance/manualSourceProtocol.ts';
import type {
  CleanupPlan,
  CleanupBatch,
  CleanupReceipt,
} from '../convex/maintenance/manualSourceProtocol.ts';

import {
  createPresenceManifest,
  reconcilePresence,
  presenceNamespaces,
  presenceLifecyclePolicy,
} from '../convex/maintenance/presenceLifecycle.ts';
import type { PresenceReport } from '../convex/maintenance/presenceLifecycle.ts';
import {
  createAuthRefreshManifest,
  reconcileAuthRefresh,
  assertAuthRefreshRuntime,
} from './auth-refresh-reconciliation.ts';
import type { AuthRefreshManifest, AuthRefreshReport } from './auth-refresh-reconciliation.ts';

/** Additional read-only proof; native mutation arguments and receipt contracts stay unchanged. */
export type OperationalCleanupPlan = CleanupPlan & { authRefresh?: AuthRefreshManifest };
export type OperationalCleanupReport = PresenceReport & { authRefresh?: AuthRefreshReport };
function assertOperationalReport(plan: OperationalCleanupPlan, report: OperationalCleanupReport) {
  if (plan.authRefresh) {
    if (
      !report.authRefresh ||
      report.authRefresh.manifestDigest !== fingerprint(plan.authRefresh) ||
      report.authRefresh.policyDigest !== plan.authRefresh.policyDigest
    )
      throw Error('O relatório Auth não corresponde ao manifesto explícito do plano.');
  } else if (report.authRefresh) throw Error('O plano legado não autoriza reconciliação Auth.');
}

type Row = { _id: string; _creationTime: number; [key: string]: unknown };
export type CleanupSnapshot = {
  sha256: string;
  tables: Record<string, Row[]>;
  files: Record<string, { size: number; sha256: string }>;
};
export type CleanupProjection = { sourceSha256: string; states: Record<string, unknown> };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const tableHash = (rows: Row[]) => fingerprint(rows.map(canonical).sort());
const registry = (table: string) => /(^|\/)_tables$/.test(table);
export const cleanupSchemaDigest = () =>
  fingerprint(JSON.parse((schema as unknown as { export(): string }).export()));

/** Reads every namespace and verifies every exported Storage blob, without logging its contents. */
export function readCleanupSnapshot(path: string): CleanupSnapshot {
  const bytes = readFileSync(path);
  const archive = unzipSync(bytes, {
    filter: ({ name }) =>
      !name.endsWith('/') && (name.endsWith('/documents.jsonl') || /(^|\/)_storage\//.test(name)),
  });
  const tables: Record<string, Row[]> = {};
  const files: CleanupSnapshot['files'] = {};
  for (const [name, content] of Object.entries(archive)) {
    if (name.endsWith('/documents.jsonl')) {
      const table = name.slice(0, -'/documents.jsonl'.length);
      if (!table || table.split('/').some((part) => !part || part === '.' || part === '..'))
        throw Error('Namespace inválido no backup.');
      tables[table] = strFromU8(content)
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          let row: Row;
          try {
            row = JSON.parse(line) as Row;
          } catch {
            throw Error('JSON inválido em documento do backup.');
          }
          if (
            !row ||
            typeof row !== 'object' ||
            (!registry(table) && (!row._id || !Number.isFinite(row._creationTime)))
          )
            throw Error('Documento inválido no backup.');
          return row;
        });
    } else if (/(^|\/)_storage\//.test(name) && !name.endsWith('/generated_schema.jsonl')) {
      files[name] = { size: content.byteLength, sha256: digest(content) };
    }
  }
  if (!tables._tables || !tables._storage)
    throw Error('Use exportação integral com --include-file-storage.');
  const accounted = new Set<string>();
  for (const [table, rows] of Object.entries(tables)) {
    if (!/(^|\/)_storage$/.test(table)) continue;
    for (const row of rows) {
      const names = Object.keys(files).filter(
        (name) => dirname(name) === table && basename(name).split('.')[0] === row._id,
      );
      if (names.length !== 1) throw Error('Bytes de Storage ausentes ou duplicados no backup.');
      const value = files[names[0]]!;
      const hash = String(row.sha256);
      if (
        value.size !== row.size ||
        (value.sha256 !== hash && Buffer.from(value.sha256, 'hex').toString('base64') !== hash)
      )
        throw Error('SHA-256 ou tamanho de Storage divergente.');
      accounted.add(names[0]);
    }
  }
  if (Object.keys(files).some((name) => !accounted.has(name)))
    throw Error('Arquivo de Storage sem metadados correspondentes.');
  return { sha256: digest(bytes), tables, files };
}

function state(row: Row) {
  if (!row.state || typeof row.state !== 'object' || Array.isArray(row.state))
    throw Error('Estado do calendário inválido no backup.');
  return row.state;
}
/** Projection files contain geometry/count/deadline results only, supplied by the pinned before/new implementations. */
export function createCleanupPlan(
  snapshot: CleanupSnapshot,
  commit: string,
  before?: CleanupProjection,
  after?: CleanupProjection,
): OperationalCleanupPlan {
  if (Boolean(before) !== Boolean(after)) throw Error('Forneça as duas projeções de equivalência.');
  let projectionDigest: string | null = null;
  if (before && after) {
    if (before.sourceSha256 !== snapshot.sha256 || after.sourceSha256 !== snapshot.sha256)
      throw Error('As projeções pertencem a outro backup.');
    const keys = cleanupTables
      .flatMap((table) => (snapshot.tables[table] ?? []).map((row) => `${table}:${row._id}`))
      .sort();
    if (
      canonical(Object.keys(before.states).sort()) !== canonical(keys) ||
      canonical(Object.keys(after.states).sort()) !== canonical(keys) ||
      fingerprint(before) !== fingerprint(after)
    )
      throw Error('As projeções não comprovam todos os estados com contagens e prazos idênticos.');
    projectionDigest = fingerprint(before);
  }
  const expected = { ...snapshot.tables };
  const batches: CleanupBatch[] = [];
  let removed = 0;
  for (const table of cleanupTables) {
    const entries: CleanupBatch['entries'] = [];
    expected[table] = (snapshot.tables[table] ?? []).map((row) => {
      const result = withoutManualSources(state(row));
      if (!result.removed) return row;
      const next = { ...row, state: result.state };
      entries.push({
        id: row._id,
        before: fingerprint(row),
        after: fingerprint(next),
        removed: result.removed,
      });
      removed += result.removed;
      return next;
    });
    for (let offset = 0; offset < entries.length; offset += 10) {
      const batch = { table, entries: entries.slice(offset, offset + 10) };
      batches.push({ ...batch, digest: fingerprint(batch) });
    }
  }
  const tables: CleanupPlan['tables'] = {};
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    tables[table] = {
      count: rows.length,
      before: tableHash(rows),
      after: tableHash(expected[table] ?? []),
    };
  }
  const plan: OperationalCleanupPlan = {
    format: 1,
    operation: 'manual-sources',
    commit,
    backupSha256: snapshot.sha256,
    schemaDigest: cleanupSchemaDigest(),
    projectionDigest,
    tables,
    files: snapshot.files,
    presence: createPresenceManifest(snapshot.tables),
    authRefresh: createAuthRefreshManifest(snapshot.tables),
    batches,
    removed,
    digest: '',
  };
  plan.digest = fingerprint({ ...plan, digest: '' });
  assertCleanupPlan(plan);
  return plan;
}

export function verifyCleanupSnapshot(
  plan: OperationalCleanupPlan,
  snapshot: CleanupSnapshot,
  phase: 'before' | 'after',
  rehearsalDigest: string | null = null,
) {
  assertCleanupPlan(plan);
  const compared = { ...snapshot.tables };
  if (phase === 'after') {
    const sourceAudit = plan.tables.audit;
    const newAudit: Row[] = [];
    compared.audit = (snapshot.tables.audit ?? []).filter((row) => {
      if (row.action !== 'manual-sources-removed' || typeof row.details !== 'string') return true;
      let details: Record<string, unknown>;
      try {
        details = JSON.parse(row.details) as Record<string, unknown>;
      } catch {
        throw Error('Auditoria de limpeza inválida.');
      }
      if (details.planDigest !== plan.digest) return true;
      const auditKeys = ['_id', '_creationTime', 'at', 'action', 'target', 'details'];
      const detailKeys = [
        'planDigest',
        'presencePolicyDigest',
        'backupSha256',
        'schemaDigest',
        'projectionDigest',
        'commit',
        'rehearsalDigest',
        'table',
        'batchDigest',
        'changed',
        'removed',
      ];
      if (
        canonical(Object.keys(row).sort()) !== canonical(auditKeys.sort()) ||
        canonical(Object.keys(details).sort()) !== canonical(detailKeys.sort()) ||
        !Number.isFinite(row.at) ||
        details.rehearsalDigest !== rehearsalDigest
      )
        throw Error('Auditoria contém campos não previstos ou outro recibo de ensaio.');
      const batch = plan.batches.find((item) => item.digest === details.batchDigest);
      if (
        !batch ||
        details.table !== batch.table ||
        details.commit !== plan.commit ||
        details.backupSha256 !== plan.backupSha256 ||
        details.schemaDigest !== plan.schemaDigest ||
        details.presencePolicyDigest !== plan.presence.policyDigest ||
        details.projectionDigest !== plan.projectionDigest ||
        details.changed !== batch.entries.length ||
        details.removed !== batch.entries.reduce((sum, entry) => sum + entry.removed, 0) ||
        canonical(row.target) !==
          canonical({ type: 'archived', reference: 'manual-source-cleanup' })
      )
        throw Error('Auditoria da limpeza diverge do plano.');
      newAudit.push(row);
      return false;
    });
    if (
      newAudit.length !== plan.batches.length ||
      new Set(
        newAudit.map(
          (row) => (JSON.parse(row.details as string) as { batchDigest: string }).batchDigest,
        ),
      ).size !== plan.batches.length
    )
      throw Error('A auditoria não comprova todos os lotes uma única vez.');
    if (!sourceAudit && !compared.audit.length) delete compared.audit;
    for (const table of cleanupTables)
      for (const row of snapshot.tables[table] ?? [])
        if (withoutManualSources(state(row)).removed)
          throw Error('Ainda há fontes manuais em estado atual ou histórico.');
  }
  if (plan.authRefresh) {
    const expected = plan.tables.authRefreshTokens ?? { count: 0, before: tableHash([]) };
    if (
      plan.authRefresh.count !== expected.count ||
      plan.authRefresh.beforeHash !== expected.before
    )
      throw Error('O manifesto Auth não corresponde ao inventário original do plano.');
  }
  for (const [table, expected] of Object.entries(plan.tables)) {
    if (table === 'authRefreshTokens' && plan.authRefresh) continue;
    if ((presenceNamespaces as readonly string[]).includes(table)) continue;
    const rows = compared[table] ?? [];
    if (rows.length !== expected.count || tableHash(rows) !== expected[phase])
      throw Error(`Conteúdo ou contagem divergente no namespace ${table}.`);
  }
  for (const [table, rows] of Object.entries(compared))
    if (
      !(table in plan.tables) &&
      rows.length &&
      !(presenceNamespaces as readonly string[]).includes(table)
    )
      throw Error(`Namespace novo não previsto no plano: ${table}.`);
  if (canonical(snapshot.files) !== canonical(plan.files))
    throw Error('Arquivos ou bytes de Storage divergiram.');
  const report: OperationalCleanupReport = {
    format: 1,
    policyDigest: plan.presence.policyDigest,
    planDigest: plan.digest,
    commit: plan.commit,
    backupSha256: plan.backupSha256,
    observedSnapshotSha256: snapshot.sha256,
    phase,
    observations: reconcilePresence(plan.presence, snapshot.tables),
    ...(plan.authRefresh
      ? { authRefresh: reconcileAuthRefresh(plan.authRefresh, snapshot.tables) }
      : {}),
  };
  assertOperationalReport(plan, report);
  return report;
}

/** Bind the narrow lifecycle policy to the exact installed component implementation. */
export function assertPresenceRuntime() {
  const require = createRequire(import.meta.url);
  const presencePath = require.resolve('@convex-dev/presence/package.json');
  for (const expected of presenceLifecyclePolicy.packages) {
    const packagePath =
      expected.name === '@convex-dev/presence'
        ? presencePath
        : createRequire(presencePath).resolve(`${expected.name}/package.json`);
    const packageRoot = dirname(packagePath);
    const info = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (item.isDirectory()) walk(path);
        else if (item.name.endsWith('.js')) files.push(path);
      }
    };
    walk(join(packageRoot, 'dist/component'));
    const hashes = files
      .sort()
      .map((path) => ({ path: relative(packageRoot, path), sha256: digest(readFileSync(path)) }));
    if (
      info.version !== expected.version ||
      digest(Buffer.from(JSON.stringify(hashes))) !== expected.componentDigest
    )
      throw Error('A implementação instalada de presença mudou; reavalie a política delimitada.');
  }
}

function privatePath(path: string, output = false) {
  if (!isAbsolute(path)) throw Error('Use caminhos privados absolutos fora do repositório.');
  const absolute = resolve(path);
  const base = output ? dirname(absolute) : absolute;
  if (output) mkdirSync(base, { recursive: true, mode: 0o700 });
  const actual = realpathSync(base);
  const relation = relative(realpathSync(root), actual);
  if (!relation || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)))
    throw Error('Backups, planos e recibos devem ficar fora do Git.');
  if (output) {
    if ((statSync(base).mode & 0o077) !== 0) throw Error('A pasta privada deve ter permissão 700.');
    return absolute;
  }
  if ((statSync(absolute).mode & 0o077) !== 0)
    throw Error('O arquivo privado deve ter permissão 600.');
  return absolute;
}
function save(path: string, value: unknown, replace = false) {
  if (!replace && existsSync(path))
    throw Error('A saída privada já existe; preserve a evidência anterior.');
  privatePath(path, true);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}
function option(args: string[], key: string, required = true) {
  const index = args.indexOf(`--${key}`);
  const value = index < 0 ? undefined : args[index + 1];
  if (required && (!value || value.startsWith('--'))) throw Error(`Falta --${key}.`);
  return value;
}
function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(privatePath(path), 'utf8')) as T;
  } catch {
    throw Error('Arquivo JSON privado inválido ou indisponível.');
  }
}

export function withCleanupEnvFile<T>(
  selection: { url: string; adminKey: string } | { deployment: string },
  run: (envFile: string) => T,
): T {
  const directory = mkdtempSync(join(tmpdir(), 'calendar-cleanup-env-'));
  const path = join(directory, 'target.env');
  try {
    const content =
      'adminKey' in selection
        ? `CONVEX_SELF_HOSTED_URL=${JSON.stringify(selection.url)}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${JSON.stringify(selection.adminKey)}\n`
        : `CONVEX_DEPLOYMENT=${JSON.stringify(`prod:${selection.deployment}`)}\n`;
    writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
    return run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
type Target = { url: string; mode: 'rehearsal' | 'production'; cli: (command: string[]) => string };
function target(args: string[]): Target {
  assertNoTargetOverrides(process.env);
  const local = option(args, 'local-project', false);
  const deployment = option(args, 'deployment', false);
  if (Boolean(local) === Boolean(deployment))
    throw Error('Escolha --local-project descartável ou --deployment de produção.');
  const env = { ...process.env };
  let selection: { url: string; adminKey: string } | { deployment: string };
  let url: string, mode: Target['mode'];
  if (local) {
    const config = JSON.parse(
      readFileSync(join(privatePath(local), '.convex/local/default/config.json'), 'utf8'),
    ) as { deploymentName: string; ports: { cloud: number }; adminKey: string };
    if (
      !config.deploymentName.startsWith('anonymous-') ||
      !Number.isInteger(config.ports.cloud) ||
      !config.adminKey
    )
      throw Error('Backend local anônimo descartável não confirmado.');
    url = `http://127.0.0.1:${config.ports.cloud}`;
    mode = 'rehearsal';
    selection = { url, adminKey: config.adminKey };
  } else {
    if (deployment !== environments.production.deployment)
      throw Error('O único deployment compartilhado admitido é a produção versionada.');
    url = environments.production.url;
    mode = 'production';
    selection = { deployment };
  }
  for (const key of ['CONVEX_DEPLOYMENT', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY'])
    delete env[key];
  const cli = (command: string[]) => {
    try {
      return withCleanupEnvFile(selection, (envFile) =>
        execFileSync(process.execPath, [convexCli, ...command, '--env-file', envFile], {
          cwd: root,
          env,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim(),
      );
    } catch {
      throw Error(
        `A CLI Convex falhou em ${command[0]}. Não repita a operação sem conferir seu estado.`,
      );
    }
  };
  const metadata = JSON.parse(cli(['function-spec'])) as { url?: string; functions?: unknown[] };
  if (metadata.url !== url || !Array.isArray(metadata.functions))
    throw Error('Os metadados não comprovam o destino solicitado.');
  console.log(
    `Destino: ${mode === 'production' ? 'produção' : 'ensaio local descartável'} (${url}).`,
  );
  return { url, mode, cli };
}
function exportSnapshot(target: Target, path: string) {
  privatePath(path, true);
  if (existsSync(path))
    throw Error('A saída do backup já existe; não sobrescreva uma evidência anterior.');
  target.cli(['export', '--include-file-storage', '--path', path]);
  chmodSync(path, 0o600);
  return readCleanupSnapshot(path);
}
function call(target: Target, name: string, value: unknown) {
  return JSON.parse(
    target.cli(['run', name, JSON.stringify(value), '--codegen', 'disable']),
  ) as unknown;
}
type Journal = {
  format: 1;
  planDigest: string;
  deploymentUrl: string;
  rehearsalDigest: string | null;
  beforePresenceReportDigest: string;
  beforeSnapshotSha256: string;
  nextBatch: number;
  batches: { digest: string; response: unknown }[];
};
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log(
      'Uso: pnpm exec tsx scripts/manual-source-cleanup.ts plan|apply|verify. Veja docs/migracao-schema.md.',
    );
    return;
  }
  const accepted: Record<string, string[]> = {
    plan: ['snapshot', 'out', 'commit', 'before-projection', 'after-projection'],
    apply: ['plan', 'confirm', 'deployment', 'local-project', 'rehearsal', 'journal'],
    verify: ['plan', 'confirm', 'deployment', 'local-project', 'rehearsal', 'snapshot', 'out'],
  };
  if (!accepted[command]) throw Error('Comando de limpeza desconhecido.');
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (
      !flag?.startsWith('--') ||
      !accepted[command].includes(flag.slice(2)) ||
      seen.has(flag) ||
      !args[index + 1] ||
      args[index + 1].startsWith('--')
    )
      throw Error('Opção desconhecida, duplicada ou sem valor; nenhuma operação iniciada.');
    seen.add(flag);
  }

  if (command === 'plan') {
    assertAuthRefreshRuntime();
    const snapshot = readCleanupSnapshot(privatePath(option(args, 'snapshot')!));
    const before = option(args, 'before-projection', false),
      after = option(args, 'after-projection', false);
    const plan = createCleanupPlan(
      snapshot,
      option(args, 'commit')!,
      before ? readJson<CleanupProjection>(before) : undefined,
      after ? readJson<CleanupProjection>(after) : undefined,
    );
    save(option(args, 'out')!, plan);
    console.log(
      `Plano ${plan.digest}: ${plan.batches.length} lotes; ${plan.removed} campos manuais; ${Object.keys(plan.tables).length} namespaces preservados.`,
    );
    return;
  }
  if (command !== 'apply' && command !== 'verify')
    throw Error(
      'Uso: manual-source-cleanup plan|apply|verify com caminhos privados absolutos e destino explícito.',
    );
  assertPresenceRuntime();
  const plan = readJson<OperationalCleanupPlan>(option(args, 'plan')!);
  if (plan.authRefresh) assertAuthRefreshRuntime();
  assertCleanupPlan(plan);
  if (cleanupSchemaDigest() !== plan.schemaDigest)
    throw Error('O schema local mudou depois do plano.');
  if (option(args, 'confirm') !== plan.digest)
    throw Error('Confirme o digest exato com --confirm.');
  const destination = target(args);
  const rehearsalPath = option(args, 'rehearsal', false);
  const rehearsal = rehearsalPath ? readJson<CleanupReceipt>(rehearsalPath) : undefined;
  if (destination.mode === 'production') {
    if (!rehearsal || !plan.projectionDigest)
      throw Error('Produção exige recibo do ensaio local e projeções de contagens/prazos.');
    assertReceipt(rehearsal, identity(plan));
    const report = readJson<OperationalCleanupReport>(`${rehearsalPath!}.presence.json`);
    assertOperationalReport(plan, report);
    if (
      fingerprint(report) !== rehearsal.presenceReportDigest ||
      report.phase !== 'after' ||
      report.planDigest !== plan.digest ||
      report.commit !== plan.commit ||
      report.backupSha256 !== plan.backupSha256 ||
      report.policyDigest !== plan.presence.policyDigest ||
      report.observedSnapshotSha256 !== rehearsal.verifiedSnapshotSha256
    )
      throw Error('O relatório delimitado de presença não corresponde ao recibo de ensaio.');
    if (
      rehearsal.mode !== 'rehearsal' ||
      rehearsal.deploymentUrl === destination.url ||
      !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rehearsal.deploymentUrl)
    )
      throw Error('Recibo fora do ensaio local descartável.');
  }
  function assertWindow() {
    const status = call(destination, 'maintenance/manualSources:preflight', {}) as {
      url: string | null;
      schemaDigest: string;
      paused: boolean;
      commit: string | null;
      smoke: boolean;
      drained: boolean;
    };
    if (
      status.url !== destination.url ||
      status.schemaDigest !== plan.schemaDigest ||
      !status.paused ||
      status.commit !== plan.commit ||
      status.smoke ||
      !status.drained
    )
      throw Error(
        'O destino/schema não confirmou manutenção exclusiva e drenada deste commit, sem smoke.',
      );
  }
  assertWindow();
  const directory = dirname(option(args, 'plan')!);
  if (command === 'apply') {
    const journalPath = option(args, 'journal')!;
    let journal: Journal;
    if (existsSync(journalPath)) {
      journal = readJson<Journal>(journalPath);
      if (
        journal.format !== 1 ||
        journal.planDigest !== plan.digest ||
        journal.deploymentUrl !== destination.url ||
        journal.rehearsalDigest !== (rehearsal?.digest ?? null) ||
        journal.nextBatch !== journal.batches.length ||
        journal.nextBatch > plan.batches.length
      )
        throw Error('Journal não corresponde ao plano, destino ou ensaio.');
      const beforeReport = readJson<OperationalCleanupReport>(`${journalPath}.presence.json`);
      assertOperationalReport(plan, beforeReport);
      if (
        fingerprint(beforeReport) !== journal.beforePresenceReportDigest ||
        beforeReport.observedSnapshotSha256 !== journal.beforeSnapshotSha256 ||
        beforeReport.planDigest !== plan.digest ||
        beforeReport.phase !== 'before'
      )
        throw Error('Relatório de presença do journal ausente ou divergente.');
      for (let index = 0; index < journal.batches.length; index++)
        if (journal.batches[index].digest !== plan.batches[index].digest)
          throw Error('Journal fora de ordem.');
    } else {
      const current = exportSnapshot(
        destination,
        join(directory, `before-${destination.mode}-${Date.now()}.zip`),
      );
      const report = verifyCleanupSnapshot(plan, current, 'before');
      save(`${journalPath}.presence.json`, report);
      journal = {
        format: 1,
        planDigest: plan.digest,
        deploymentUrl: destination.url,
        rehearsalDigest: rehearsal?.digest ?? null,
        beforePresenceReportDigest: fingerprint(report),
        beforeSnapshotSha256: current.sha256,
        nextBatch: 0,
        batches: [],
      };
      save(journalPath, journal);
    }
    for (let index = journal.nextBatch; index < plan.batches.length; index++) {
      const batch = plan.batches[index];
      const response = call(destination, 'maintenance/manualSources:applyBatch', {
        ...identity(plan),
        table: batch.table,
        entries: batch.entries,
        batchDigest: batch.digest,
        mode: destination.mode,
        ...(rehearsal ? { rehearsal } : {}),
      }) as { changed: number; removed: number; replayed: number; batchDigest: string };
      if (
        response.batchDigest !== batch.digest ||
        response.changed + response.replayed !== batch.entries.length
      )
        throw Error('O backend não confirmou integralmente o lote.');
      journal.batches.push({ digest: batch.digest, response });
      journal.nextBatch = index + 1;
      save(journalPath, journal, true);
      console.log(`Lote ${index + 1}/${plan.batches.length} confirmado.`);
    }
    console.log(
      'Aplicação concluída; manutenção deve permanecer até verify e conferência do recibo.',
    );
  } else {
    const snapshotPath = option(args, 'snapshot')!;
    const snapshot = exportSnapshot(destination, snapshotPath);
    const report = verifyCleanupSnapshot(plan, snapshot, 'after', rehearsal?.digest ?? null);
    assertWindow();
    const receipt: CleanupReceipt = {
      ...identity(plan),
      format: 1,
      operation: 'manual-sources',
      mode: destination.mode,
      deploymentUrl: destination.url,
      verifiedSnapshotSha256: snapshot.sha256,
      removed: plan.removed,
      result: 'verified',
      presenceReportDigest: fingerprint(report),
      digest: '',
    };
    receipt.digest = fingerprint({ ...receipt, digest: '' });
    save(`${option(args, 'out')!}.presence.json`, report);
    save(option(args, 'out')!, receipt);
    console.log(
      `Verificação concluída: ${plan.removed} campos removidos; demais dados, namespaces e Storage conferidos. Recibo ${receipt.digest}.`,
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha na limpeza administrativa.');
    process.exitCode = 1;
  });
