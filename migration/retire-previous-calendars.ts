/** One-off offline contract migration. Never imported by the running application. */
import { fingerprint, stableJson, tableFingerprint } from './plan.ts';
import type { Document, MigrationPlan, Operation, Snapshot } from './types.ts';

const retiredTables = new Set(['histories', 'historyAnalyses']);
const temporaryTables = new Set(['nativeUploads', 'nativeFileTickets']);
const object = (value: unknown): Document => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Estrutura inválida no backup de calendários.');
  return value as Document;
};
function detachState(value: unknown): Document {
  const { ignoredHistory: _ignored, ...state } = object(value);
  if (!Array.isArray(state.events)) throw Error('Estado sem lista de eventos.');
  return {
    ...state,
    events: state.events.map((item) => {
      const { historicalSource: _source, ...event } = object(item);
      return event;
    }),
  };
}
function strings(value: unknown, visit: (id: string) => void) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, visit));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => strings(item, visit));
}

export function createHistoryRetirementPlan(source: Snapshot, sourceDigest: string): MigrationPlan {
  if (!source._storage || !source._tables)
    throw Error('A limpeza exige backup completo com Storage.');
  const expected = structuredClone(source);
  const histories = new Map((source.histories ?? []).map((row) => [row._id, row]));
  const files = new Set(
    [...histories.values()].flatMap((row) =>
      typeof row.storageId === 'string' ? [row.storageId] : [],
    ),
  );
  // Keep any original also used by documents, snapshots, reviews, runtime artifacts or other data.
  for (const [table, rows] of Object.entries(source))
    if (!table.startsWith('_') && !retiredTables.has(table) && !temporaryTables.has(table))
      strings(rows, (id) => files.delete(id));
  for (const table of ['calendarContents', 'calendarSnapshots'])
    expected[table] = (source[table] ?? []).map((row) => ({
      ...row,
      state: detachState(row.state),
    }));
  expected.audit = (source.audit ?? []).map((row) => {
    const target = object(row.target);
    if (target.type !== 'history') return row;
    const history = histories.get(String(target.id));
    return {
      ...row,
      ...(row.calendarId === undefined && history ? { calendarId: history.calendarId } : {}),
      ...(row.campusId === undefined && history ? { campusId: history.campusId } : {}),
      target: { type: 'archived', reference: `previous-calendar:${String(target.id)}` },
    };
  });
  for (const table of retiredTables) expected[table] = [];
  for (const table of temporaryTables)
    expected[table] = (source[table] ?? []).filter((row) => !files.has(String(row.storageId)));
  expected._storage = source._storage.filter((row) => !files.has(row._id));
  const tables = Object.keys(expected).filter(
    (table) => !['_tables', 'migrationState'].includes(table),
  );
  const operations: Operation[] = [];
  for (const table of tables) {
    const next = new Map(expected[table].map((row) => [row._id, row]));
    for (const row of source[table] ?? []) {
      const replacement = next.get(row._id);
      if (!replacement) operations.push({ kind: 'delete', table, id: row._id });
      else if (stableJson(row) !== stableJson(replacement)) {
        const { _id, _creationTime: _created, ...document } = replacement;
        operations.push({ kind: 'replace', table, id: _id, document });
      }
    }
  }
  // Delete bytes last, after events have been detached and source records removed.
  operations.sort((a, b) => Number(a.table === '_storage') - Number(b.table === '_storage'));
  const batches: MigrationPlan['batches'] = [];
  let pending: Operation[] = [];
  for (const operation of operations) {
    if (Buffer.byteLength(stableJson([operation])) > 90_000)
      throw Error('Documento excede o limite seguro de migração.');
    if (
      pending.length &&
      (pending.length >= 200 || Buffer.byteLength(stableJson([...pending, operation])) > 90_000)
    ) {
      batches.push({ digest: fingerprint(pending), operations: pending });
      pending = [];
    }
    pending.push(operation);
  }
  if (pending.length) batches.push({ digest: fingerprint(pending), operations: pending });
  const counts = (snapshot: Snapshot) =>
    Object.fromEntries(tables.map((table) => [table, (snapshot[table] ?? []).length]));
  const prints = (snapshot: Snapshot) =>
    Object.fromEntries(tables.map((table) => [table, tableFingerprint(snapshot[table] ?? [])]));
  const plan: MigrationPlan = {
    format: 1,
    purpose: 'retire-previous-calendars',
    sourceDigest,
    digest: '',
    tables: tables.filter((table) => !table.startsWith('_')),
    sourceCounts: counts(source),
    sourceFingerprints: prints(source),
    expectedCounts: counts(expected),
    fingerprints: prints(expected),
    batches,
    missingFiles: (source.documents ?? [])
      .filter((row) => row.unavailableFile !== undefined)
      .map((row) => ({ table: 'documents', id: row._id, filename: String(row.filename) })),
  };
  plan.digest = fingerprint({ ...plan, digest: '' });
  return plan;
}
