/** Read-only reconciliation of the installed presence runtime, never a migration allowlist. */
import { jsonToConvex } from 'convex/values';
import { canonical, fingerprint, hexDigest } from './canonical';

export type LifecycleRow = { _id: string; _creationTime: number; [key: string]: unknown };
type Rows = Record<string, LifecycleRow[]>;
const prefix = '_components/presence/';
const workerPrefix = `${prefix}_components/batchWorker/`;
export const presenceNamespaces = [
  `${prefix}presence`,
  `${prefix}sessions`,
  `${prefix}roomTokens`,
  `${prefix}sessionTokens`,
  `${workerPrefix}workers`,
  `${workerPrefix}workerState`,
] as const;
export const presenceLifecyclePolicy = {
  version: 'presence-runtime-v1',
  packages: [
    {
      name: '@convex-dev/presence',
      version: '0.4.0',
      componentDigest: '5d4d3788cb026bfe46ddaa8861b4c5438002d06bfc45fad1103939a9145eaac8',
    },
    {
      name: '@convex-dev/batch-worker',
      version: '0.2.2',
      componentDigest: '59873ddcedb56fc454d3d90e034967cc881fad52a826031146850c1890228818',
    },
  ],
  mutable: {
    presence: ['online', 'lastDisconnected'],
    sessions: ['deadline'],
    roomTokens: [],
    sessionTokens: [],
    workers: ['status', 'stateId'],
    workerState: ['generation', 'lastWorkTs', 'runnerId', 'monitorId', 'monitorRunAtMs'],
  },
} as const;
export const presencePolicyDigest = fingerprint(presenceLifecyclePolicy);
export type LifecycleEntry = {
  id: string;
  stable: string;
  full: string;
  sessionHash?: string;
  deadline?: number;
  generation?: string;
  lastWorkTs?: number;
  stateId?: string;
  status?: string;
};
export type PresenceManifest = {
  policyDigest: string;
  tables: Record<string, { count: number; hash: string; rows: LifecycleEntry[] }>;
};
export type PresenceObservation = {
  namespace: string;
  beforeCount: number;
  afterCount: number;
  beforeHash: string;
  afterHash: string;
  retainedBeforeHash: string;
  retainedAfterHash: string;
  inserted: number;
  deleted: number;
  updated: number;
};
export type PresenceReport = {
  format: 1;
  policyDigest: string;
  planDigest: string;
  commit: string;
  backupSha256: string;
  observedSnapshotSha256: string;
  phase: 'before' | 'after';
  observations: PresenceObservation[];
};
const finalName = (namespace: string) =>
  namespace.slice(namespace.lastIndexOf('/') + 1) as keyof typeof presenceLifecyclePolicy.mutable;
const hashRows = (rows: LifecycleRow[]) => fingerprint(rows.map(canonical).sort());
const without = (row: LifecycleRow, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Ciclo de presença incompatível: ${message}.`);
}
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
function generation(value: unknown): bigint {
  // Export ZIP emits safe int64 values as JSON numbers; extended Convex JSON keeps larger values.
  if (typeof value === 'number') {
    requireValue(Number.isSafeInteger(value) && value >= 0, 'generation numérica inválida');
    return BigInt(value);
  }
  const decoded = jsonToConvex(value as Parameters<typeof jsonToConvex>[0]);
  requireValue(typeof decoded === 'bigint' && decoded >= 0n, 'generation inválida');
  return decoded;
}
function shape(namespace: string, row: LifecycleRow) {
  const name = finalName(namespace);
  const fields: Record<typeof name, string[]> = {
    presence: ['roomId', 'userId', 'online', 'lastDisconnected', 'data'],
    sessions: ['roomId', 'userId', 'sessionId', 'deadline'],
    roomTokens: ['token', 'roomId'],
    sessionTokens: ['token', 'sessionId'],
    workers: ['name', 'workQuery', 'workerMutation', 'config', 'status', 'stateId'],
    workerState: ['generation', 'lastWorkTs', 'runnerId', 'monitorId', 'monitorRunAtMs'],
  };
  requireValue(
    text(row._id) &&
      number(row._creationTime) &&
      Object.keys(row).every((key) => ['_id', '_creationTime', ...fields[name]].includes(key)),
    `campos desconhecidos em ${namespace}`,
  );
  for (const key of name === 'presence'
    ? ['roomId', 'userId']
    : name === 'sessions'
      ? ['roomId', 'userId', 'sessionId']
      : name === 'roomTokens'
        ? ['roomId', 'token']
        : name === 'sessionTokens'
          ? ['sessionId', 'token']
          : name === 'workers'
            ? ['name', 'workQuery', 'workerMutation', 'stateId']
            : [])
    requireValue(text(row[key]), `identidade inválida em ${namespace}`);
  if (name === 'presence')
    requireValue(
      typeof row.online === 'boolean' && number(row.lastDisconnected),
      'estado online inválido',
    );
  if (name === 'sessions' && row.deadline !== undefined)
    requireValue(number(row.deadline), 'deadline inválida');
  if (name === 'workerState') {
    generation(row.generation);
    requireValue(number(row.lastWorkTs), 'lastWorkTs inválido');
    for (const key of ['runnerId', 'monitorId'])
      if (row[key] !== undefined) requireValue(text(row[key]), 'identificador de job inválido');
    if (row.monitorRunAtMs !== undefined)
      requireValue(number(row.monitorRunAtMs), 'monitorRunAtMs inválido');
  }
  if (name === 'workers') {
    requireValue(
      row.name === 'disconnect' &&
        row.config !== null &&
        typeof row.config === 'object' &&
        !Array.isArray(row.config) &&
        row.status !== null &&
        typeof row.status === 'object' &&
        !Array.isArray(row.status),
      'worker/config desconhecido',
    );
    const status = row.status as Record<string, unknown>;
    requireValue(
      Object.keys(status).length === 1 &&
        ['idle', 'running', 'stopped'].includes(String(status.kind)),
      'status de worker desconhecido',
    );
  }
}
function entries(namespace: string, rows: LifecycleRow[]): LifecycleEntry[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    shape(namespace, row);
    requireValue(!seen.has(row._id), `ID duplicado em ${namespace}`);
    seen.add(row._id);
    const name = finalName(namespace);
    return {
      id: row._id,
      full: fingerprint(row),
      stable: fingerprint(without(row, presenceLifecyclePolicy.mutable[name])),
      ...(name === 'sessions' || name === 'sessionTokens'
        ? { sessionHash: fingerprint(row.sessionId) }
        : {}),
      ...(name === 'sessions' && row.deadline !== undefined
        ? { deadline: row.deadline as number }
        : {}),
      ...(name === 'workerState'
        ? {
            generation: generation(row.generation).toString(),
            lastWorkTs: row.lastWorkTs as number,
          }
        : {}),
      ...(name === 'workers'
        ? { stateId: row.stateId as string, status: String((row.status as { kind: unknown }).kind) }
        : {}),
    };
  });
}
export function createPresenceManifest(tables: Rows): PresenceManifest {
  return {
    policyDigest: presencePolicyDigest,
    tables: Object.fromEntries(
      presenceNamespaces.map((namespace) => {
        const rows = tables[namespace] ?? [];
        return [
          namespace,
          { count: rows.length, hash: hashRows(rows), rows: entries(namespace, rows) },
        ];
      }),
    ),
  };
}
function activeUser(tables: Rows, userId: unknown) {
  const user = (tables.users ?? []).find((row) => row._id === userId);
  requireValue(
    user?.active === true && user.removedAt === undefined,
    'usuário novo sem identidade ativa preservada',
  );
  return user;
}
function newSession(tables: Rows, row: LifecycleRow) {
  requireValue(row.roomId === 'application', 'sala nova não exposta pela aplicação');
  const user = activeUser(tables, row.userId);
  const match = /^([^:]+):[a-f0-9-]{36}$/.exec(String(row.sessionId));
  const auth = match && (tables.authSessions ?? []).find((item) => item._id === match[1]);
  requireValue(
    auth &&
      auth.userId === row.userId &&
      typeof auth.expirationTime === 'number' &&
      auth.expirationTime > row._creationTime &&
      (auth.generation ?? 0) === (user.sessionGeneration ?? 0),
    'sessão nova não corresponde à sessão Auth preservada',
  );
}
/** A data-only proof of compatible runtime transitions, plus a full hash/count inventory, not causal event replay. */
export function reconcilePresence(manifest: PresenceManifest, tables: Rows): PresenceObservation[] {
  requireValue(
    manifest.policyDigest === presencePolicyDigest &&
      canonical(Object.keys(manifest.tables).sort()) === canonical([...presenceNamespaces].sort()),
    'política ou namespaces divergentes',
  );
  for (const namespace of presenceNamespaces) {
    const table = manifest.tables[namespace];
    requireValue(
      table &&
        table.count === table.rows.length &&
        hexDigest(table.hash) &&
        new Set(table.rows.map((row) => row.id)).size === table.count &&
        table.rows.every((row) => text(row.id) && hexDigest(row.stable) && hexDigest(row.full)),
      'manifesto inválido',
    );
  }
  const current = createPresenceManifest(tables);
  const afterSessions = tables[`${prefix}sessions`] ?? [];
  const beforeSessions = manifest.tables[`${prefix}sessions`].rows;
  const afterStates = new Set((tables[`${workerPrefix}workerState`] ?? []).map((row) => row._id));
  const beforeStates = new Set(
    manifest.tables[`${workerPrefix}workerState`].rows.map((row) => row.id),
  );
  return presenceNamespaces.map((namespace) => {
    const name = finalName(namespace),
      before = manifest.tables[namespace],
      after = current.tables[namespace];
    const prior = new Map(before.rows.map((row) => [row.id, row]));
    const now = new Map(after.rows.map((row) => [row.id, row]));
    const raw = new Map((tables[namespace] ?? []).map((row) => [row._id, row]));
    const retainedBefore: [string, string][] = [],
      retainedAfter: [string, string][] = [];
    let inserted = 0,
      deleted = 0,
      updated = 0;
    for (const row of after.rows) {
      const original = prior.get(row.id),
        value = raw.get(row.id)!;
      if (original) {
        requireValue(original.stable === row.stable, `campo estável alterado em ${namespace}`);
        retainedBefore.push([row.id, original.stable]);
        retainedAfter.push([row.id, row.stable]);
        if (name === 'sessions' && original.deadline !== undefined)
          requireValue(
            row.deadline !== undefined && row.deadline >= original.deadline,
            'deadline retrocedeu',
          );
        if (name === 'workerState')
          requireValue(
            BigInt(row.generation!) >= BigInt(original.generation!) &&
              row.lastWorkTs! >= original.lastWorkTs!,
            'estado do worker retrocedeu',
          );
        if (name === 'workers') {
          requireValue(
            row.stateId === original.stateId ||
              (!beforeStates.has(original.stateId!) && afterStates.has(row.stateId!)),
            'stateId válido substituído',
          );
          requireValue(
            row.status === original.status ||
              (row.status !== 'stopped' && original.status !== 'stopped'),
            'start/stop administrativo de worker',
          );
        }
      } else {
        inserted++;
        if (name === 'sessions') newSession(tables, value);
        if (name === 'presence') {
          requireValue(
            value.roomId === 'application' && value.data === undefined,
            'presence nova fora da sala/dados expostos',
          );
          activeUser(tables, value.userId);
        }
        if (name === 'roomTokens')
          requireValue(
            value.roomId === 'application' && /^[-a-f0-9]{36}$/.test(String(value.token)),
            'roomToken novo inválido',
          );
        if (name === 'sessionTokens')
          requireValue(
            /^[-a-f0-9]{36}$/.test(String(value.token)) &&
              afterSessions.some((session) => session.sessionId === value.sessionId),
            'sessionToken novo sem sessão',
          );
        if (name === 'workers') requireValue(false, 'criação de worker fora da janela delimitada');
        if (name === 'workerState')
          requireValue(
            (tables[`${workerPrefix}workers`] ?? []).some((worker) => worker.stateId === value._id),
            'workerState novo órfão',
          );
      }
    }
    for (const row of before.rows)
      if (!now.has(row.id)) {
        deleted++;
        requireValue(
          name === 'sessions' || name === 'sessionTokens',
          `remoção não é lifecycle em ${namespace}`,
        );
        if (name === 'sessionTokens')
          requireValue(
            !beforeSessions.some(
              (session) =>
                session.sessionHash === row.sessionHash &&
                current.tables[`${prefix}sessions`].rows.some((after) => after.id === session.id),
            ),
            'token removido de sessão que permaneceu',
          );
      }
    const immutableNames = name === 'roomTokens' || name === 'sessionTokens';
    // Exact retained-row changes are derived without exposing token/session values in the report.
    if (immutableNames) updated = 0;
    else
      updated = after.rows.filter((row) => {
        const old = prior.get(row.id);
        return old && row.full !== old.full;
      }).length;
    return {
      namespace,
      beforeCount: before.count,
      afterCount: after.count,
      beforeHash: before.hash,
      afterHash: after.hash,
      retainedBeforeHash: fingerprint(retainedBefore.sort(([a], [b]) => a.localeCompare(b))),
      retainedAfterHash: fingerprint(retainedAfter.sort(([a], [b]) => a.localeCompare(b))),
      inserted,
      deleted,
      updated,
    };
  });
}
