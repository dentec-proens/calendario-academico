import type { CalendarActivity } from '../src/domain-types.ts';
import { createHash } from 'node:crypto';
import { decodeValue } from './legacy-codec.ts';
import { mergeLegacyStages, migrateAssessmentEvents } from '../src/obligations.ts';
import type { Document, MigrationPlan, Operation, Row, Snapshot } from './types.ts';

type Legacy = Record<string, any>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Document)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => hash(stableJson(value));
const body = ({ _id, _creationTime, ...document }: Row) => document;
const decode = (row: Row): Legacy => {
  const value = decodeValue(row.value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Registro legado inválido.');
  return value;
};
const clean = (value: any): any => {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : clean(item)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, clean(item)]),
    );
  return value;
};
function timestamp(value: unknown, label: string): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw Error(`Timestamp inválido: ${label}.`);
  return parsed;
}
function revision(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw Error('Revisão de catálogo inválida.');
  return result;
}
const removed = [
  'rootFields',
  'scopeVersions',
  'sessions',
  'loginAttempts',
  'recoveryAttempts',
  'uploads',
  'fileObjects',
];
const preserved = (table: string) => table.startsWith('auth') || table.startsWith('_');

/** Pure conversion. The source snapshot and its Auth records are never edited. */
export function createPlan(source: Snapshot, sourceDigest: string): MigrationPlan {
  const operations: Operation[] = [];
  if (source.calendarAliases?.length)
    throw Error(
      'A origem já contém aliases de calendário; confira se a consolidação já foi iniciada.',
    );
  const expected: Snapshot = Object.fromEntries(
    Object.entries(source)
      .filter(([table]) => preserved(table))
      .map(([table, rows]) => [table, structuredClone(rows)]),
  );
  const missingFiles: MigrationPlan['missingFiles'] = [];
  const maps: Record<string, Map<string, string>> = {};
  for (const table of ['users', 'campuses', 'calendars', 'histories', 'reviews', 'documents']) {
    const map = (maps[table] = new Map());
    for (const row of source[table] ?? []) {
      const item = decode(row);
      for (const id of [
        row._id,
        row.key,
        row.appId,
        item.id,
        table === 'reviews' ? item.calendarId : undefined,
      ]) {
        if (typeof id !== 'string') continue;
        if (map.has(id) && map.get(id) !== row._id)
          throw Error(`Identidade duplicada em ${table}.`);
        map.set(id, row._id);
      }
    }
  }
  function ref(table: string, value: unknown): string {
    const id = typeof value === 'string' ? maps[table]?.get(value) : undefined;
    if (!id) throw Error(`Referência órfã em ${table}.`);
    return id;
  }
  function replace(table: string, row: Row, document: Document) {
    const data = clean(document);
    operations.push({ kind: 'replace', table, id: row._id, document: data });
    (expected[table] ??= []).push({ _id: row._id, _creationTime: row._creationTime, ...data });
  }
  function insert(table: string, document: Document) {
    const data = clean(document);
    operations.push({ kind: 'insert', table, document: data });
    (expected[table] ??= []).push({ _id: '<new>', _creationTime: 0, ...data });
  }
  function event(item: Legacy) {
    return clean({
      ...item,
      historicalSource: item.historicalSource
        ? { ...item.historicalSource, historyId: ref('histories', item.historicalSource.historyId) }
        : undefined,
    });
  }
  function historyKey(key: string): string {
    // Ignore decisions use a compound key: history ID + ':' + candidate key.
    // Translate only its ID prefix; the candidate fingerprint is immutable.
    const prefix = [...maps.histories.keys()]
      .sort((a, b) => b.length - a.length)
      .find((id) => key.startsWith(`${id}:`));
    return prefix ? ref('histories', prefix) + key.slice(prefix.length) : key;
  }
  function vacation(item: Legacy | undefined, year: number) {
    if (!item || item.firstStart) return item;
    if (typeof item.julyStart !== 'string') throw Error('Férias legadas inválidas.');
    const end = new Date(`${item.julyStart}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 14);
    return {
      firstStart: `${year}-01-02`,
      firstEnd: `${year}-01-31`,
      secondStart: item.julyStart,
      secondEnd: end.toISOString().slice(0, 10),
      evidence: item.evidence,
    };
  }
  function state(item: Legacy, historical: boolean) {
    if (historical)
      return {
        ...item,
        ignoredHistory: item.ignoredHistory?.map(historyKey),
        events: item.events.map(event),
      };
    const modalities = item.modalities?.length ? item.modalities : [item.offer];
    const stages =
      item.assessmentStagesByModality ??
      ([2, 3, 4].includes(Number(item.assessmentStages))
        ? Object.fromEntries(modalities.map((m: string) => [m, Number(item.assessmentStages)]))
        : {});
    const events = migrateAssessmentEvents({
      ...item,
      offer: item.offer,
      events: mergeLegacyStages<CalendarActivity>(item.events),
      modalities,
      assessmentStagesByModality: stages,
    });
    const result = clean({
      regime: item.regime,
      weekdays: item.weekdays,
      weekConfirmed: item.weekConfirmed,
      weekEvidence: item.weekEvidence ?? '',
      periods: item.periods,
      events: events.map(event),
      secondSemesterIntake: item.secondSemesterIntake,
      teacherDayDate: item.teacherDayDate,
      ignoredHistory: (item.ignoredHistory ?? []).map(historyKey),
      teacherVacations: vacation(item.teacherVacations, item.year),
      assessmentStagesByModality: stages,
    });
    return result;
  }
  const fileMap = new Map((source.fileObjects ?? []).map((row) => [row.path, row.storageId]));
  const storage = new Set((source._storage ?? []).map((row) => row._id));
  function file(item: Legacy, table: string, id: string) {
    if (item.data !== undefined && item.data !== null)
      throw Error(
        `Arquivo inline encontrado em ${table}; transfira e confira os bytes no Storage antes de gerar o plano.`,
      );
    const storageId = item.storageId ?? fileMap.get(item.objectKey);
    if (storageId && !storage.has(storageId))
      throw Error('Storage referenciado não consta no backup completo.');
    if (!storageId) missingFiles.push({ table, id, filename: item.filename });
    return {
      filename: item.filename,
      hash: item.hash,
      storageId,
      unavailableFile: storageId
        ? undefined
        : { sourceReference: String(item.objectKey ?? item.path ?? id), reason: 'not_migrated' },
    };
  }
  function documents(items: Legacy[]) {
    return (items ?? []).map((item) => {
      const migratedFile = file(item, 'documentSnapshot', item.id);
      return {
        ...item,
        id: ref('documents', item.id),
        ...migratedFile,
        createdAt: timestamp(item.createdAt, 'documentSnapshot.createdAt'),
        createdBy: item.createdBy ? ref('users', item.createdBy) : undefined,
        publishedAt: item.publishedAt
          ? timestamp(item.publishedAt, 'documentSnapshot.publishedAt')
          : undefined,
        publishedBy: item.publishedBy ? ref('users', item.publishedBy) : undefined,
        archivedAt: item.archivedAt
          ? timestamp(item.archivedAt, 'documentSnapshot.archivedAt')
          : undefined,
        objectKey: undefined,
        data: undefined,
      };
    });
  }
  function review(item: Legacy) {
    if (item.officialApproval !== undefined && item.officialApproval !== false)
      throw Error('Aprovação oficial histórica exige migração explícita.');
    const { history: _history, officialApproval: _officialApproval, ...rest } = item;
    return {
      ...rest,
      calendarId: ref('calendars', item.calendarId),
      catalogueRevision: revision(item.catalogueRevision),
      documentSnapshot: documents(item.documentSnapshot),
      reviewer: { ...item.reviewer, id: ref('users', item.reviewer.id) },
      updatedAt: timestamp(item.updatedAt, 'review.updatedAt'),
    };
  }
  for (const row of source.campuses ?? []) {
    const item = decode(row);
    replace('campuses', row, { name: item.name, archived: item.archived === true });
  }
  for (const row of source.users ?? []) {
    const item = decode(row);
    const native = Object.fromEntries(
      [
        'name',
        'image',
        'email',
        'emailVerificationTime',
        'phone',
        'phoneVerificationTime',
        'isAnonymous',
      ]
        .filter((key) => row[key] !== undefined)
        .map((key) => [key, row[key]]),
    );
    replace('users', row, {
      ...native,
      name: item.name ?? row.name ?? '',
      email: item.email ?? row.email,
      role: item.role,
      campusId: item.campusId ? ref('campuses', item.campusId) : undefined,
      active: item.active,
      loginMethod: item.loginMethod ?? 'local',
      inviteExpiresAt:
        item.inviteExpiresAt === undefined
          ? undefined
          : timestamp(item.inviteExpiresAt, 'user.inviteExpiresAt'),
      removedAt:
        item.removedAt === undefined ? undefined : timestamp(item.removedAt, 'user.removedAt'),
      nativeInviteHash: item.nativeInviteHash,
      nativeResetHash: item.nativeResetHash,
      googleSubject: item.googleSubject,
      googleLastLoginAt:
        item.googleLastLoginAt === undefined
          ? undefined
          : timestamp(item.googleLastLoginAt, 'user.googleLastLoginAt'),
    });
  }
  const aliases = new Set<string>();
  for (const row of source.calendars ?? []) {
    const item = decode(row);
    if (typeof item.id !== 'string' || !item.id || aliases.has(item.id))
      throw Error('Alias de calendário ausente ou duplicado.');
    aliases.add(item.id);
    insert('calendarAliases', { alias: item.id, calendarId: row._id });
    replace('calendars', row, {
      campusId: ref('campuses', item.campusId),
      year: item.state.year,
      modalities: item.state.modalities?.length ? item.state.modalities : [item.state.offer],
      purpose: item.purpose === 'test' ? 'test' : 'definitive',
      courses: item.courses ?? '',
      classes: item.classes ?? '',
      shifts: item.shifts ?? '',
      version: item.version,
      updatedAt: timestamp(item.updatedAt, 'calendar.updatedAt'),
      deletedAt:
        item.deletedAt === undefined ? undefined : timestamp(item.deletedAt, 'calendar.deletedAt'),
      deletedBy: item.deletedBy ? ref('users', item.deletedBy) : undefined,
    });
    insert('calendarContents', {
      calendarId: row._id,
      state: state(item.state, false),
      catalogueRevision: revision(item.catalogueRevision),
      institutionalSnapshot: (item.institutionalSnapshot ?? []).map(event),
      documentSnapshot: documents(item.documentSnapshot),
    });
    const versions = (source.calendarVersions ?? []).filter((v) => v.ownerId === row.key);
    if (versions.length !== row.versionCount)
      throw Error('Contagem de versões divergente do calendário.');
    const ordinals = versions.map((v) => Number(v.ordinal)).sort((a, b) => a - b);
    if (ordinals.some((n, i) => n !== i))
      throw Error('Lacuna ou duplicata no histórico de calendário.');
    const versionNumbers = versions.map((v) => decode({ ...v, value: v.metadata }).version);
    if (new Set(versionNumbers).size !== versionNumbers.length)
      throw Error('Número de versão duplicado no histórico de calendário.');
  }
  for (const row of source.calendarVersions ?? []) {
    const meta = decode({ ...row, value: row.metadata });
    replace('calendarVersions', row, {
      calendarId: ref('calendars', row.ownerId),
      version: meta.version,
      at: timestamp(meta.at, 'version.at'),
      catalogueRevision: revision(meta.catalogueRevision),
      snapshotId: row.snapshotId,
    });
    const snapshot = (source.calendarSnapshots ?? []).find((s) => s._id === row.snapshotId);
    if (!snapshot) throw Error('Snapshot histórico ausente.');
    const saved = decode(snapshot);
    if (
      saved.version !== meta.version ||
      timestamp(saved.at, 'snapshot.at') !== timestamp(meta.at, 'version.at') ||
      revision(saved.catalogueRevision) !== revision(meta.catalogueRevision)
    )
      throw Error('Metadados da versão divergem do snapshot histórico.');
  }
  for (const row of source.calendarSnapshots ?? []) {
    const item = decode(row);
    replace('calendarSnapshots', row, {
      state: state(item.state, true),
      purpose: item.purpose,
      at: timestamp(item.at, 'snapshot.at'),
      catalogueRevision: revision(item.catalogueRevision),
      institutionalEvents: (item.institutionalEvents ?? []).map(event),
      documentSnapshot: documents(item.documentSnapshot),
    });
  }
  for (const row of source.histories ?? []) {
    const item = decode(row);
    replace('histories', row, {
      calendarId: ref('calendars', item.calendarId),
      campusId: ref('campuses', item.campusId),
      year: item.year,
      modalities: item.modalities?.length ? item.modalities : [item.offer],
      ...file(item, 'histories', row._id),
      notes: item.notes ?? '',
      createdAt: timestamp(item.createdAt, 'history.createdAt'),
    });
    if (item.analysis) insert('historyAnalyses', { historyId: row._id, analysis: item.analysis });
  }
  for (const row of source.documents ?? []) {
    const item = decode(row);
    replace('documents', row, {
      year: item.year,
      type: item.type,
      title: item.title,
      source: item.source,
      ...file(item, 'documents', row._id),
      size: item.size,
      status: item.status,
      version: item.version,
      createdAt: timestamp(item.createdAt, 'document.createdAt'),
      createdBy: item.createdBy ? ref('users', item.createdBy) : undefined,
      publishedAt:
        item.publishedAt === undefined
          ? undefined
          : timestamp(item.publishedAt, 'document.publishedAt'),
      publishedBy: item.publishedBy ? ref('users', item.publishedBy) : undefined,
      archivedAt:
        item.archivedAt === undefined
          ? undefined
          : timestamp(item.archivedAt, 'document.archivedAt'),
    });
  }
  for (const row of source.reviews ?? []) {
    const item = decode(row);
    replace('reviews', row, review(item));
    const history = (source.reviewVersions ?? []).filter((v) => v.ownerId === row.key);
    if (history.length !== row.historyCount)
      throw Error('Contagem de revisões de parecer divergente.');
    const ordinals = history.map((v) => Number(v.ordinal)).sort((a, b) => a - b);
    if (ordinals.some((n, i) => n !== i))
      throw Error('Lacuna ou duplicata no histórico de parecer.');
    const revisions = history.map((v) => decode(v).revision);
    if (new Set(revisions).size !== revisions.length)
      throw Error('Número de revisão duplicado no histórico de parecer.');
  }
  for (const row of source.reviewVersions ?? [])
    replace('reviewVersions', row, {
      reviewId: ref('reviews', row.ownerId),
      ...review(decode(row)),
    });
  for (const row of source.invitations ?? []) {
    const item = decode(row);
    replace('invitations', row, {
      tokenHash: item.tokenHash,
      userId: ref('users', item.userId),
      createdBy: ref('users', item.createdBy),
      createdAt: timestamp(item.createdAt, 'invitation.createdAt'),
      expiresAt: timestamp(item.expiresAt, 'invitation.expiresAt'),
      revoked: item.revoked,
      usedAt: item.usedAt === undefined ? undefined : timestamp(item.usedAt, 'invitation.usedAt'),
    });
  }
  for (const row of source.passwordResets ?? []) {
    const item = decode(row);
    replace('passwordResets', row, {
      tokenHash: item.tokenHash ?? item.hash,
      userId: ref('users', item.userId),
      expiresAt: timestamp(item.expiresAt ?? item.expires, 'passwordReset.expiresAt'),
      usedAt:
        item.usedAt === undefined ? undefined : timestamp(item.usedAt, 'passwordReset.usedAt'),
    });
  }
  for (const row of source.nativeUploads ?? []) {
    const { objectKey: _objectKey, ...rest } = body(row);
    replace('nativeUploads', row, {
      ...rest,
      storageId: row.storageId ?? fileMap.get(row.objectKey),
    });
  }
  for (const row of source.nativeFileTickets ?? []) replace('nativeFileTickets', row, body(row));
  const catalogue = (source.rootFields ?? []).find((row) => row.name === 'catalogue');
  if (!catalogue) throw Error('Base institucional ausente.');
  const data = decode(catalogue);
  insert('institutionSettings', { key: 'catalogue', revision: revision(data.revision) });
  const years = new Set<number>(
    (source.calendars ?? []).map((row) => Number(decode(row).state.year)),
  );
  for (const item of data.events ?? []) {
    const year = Number(item.start.slice(0, 4));
    years.add(year);
    insert('institutionalEvents', {
      code: item.id,
      year,
      name: item.name,
      start: item.start,
      end: item.end,
      kind: item.kind,
      category: item.category,
      evidence: item.evidence,
      modalities: item.modalities ?? item.offers ?? [],
      active: item.active !== false,
    });
  }
  for (const year of [...years].sort((a, b) => a - b))
    insert('catalogueRevisions', { year, revision: revision(data.revision) });
  for (const row of source.audit ?? []) {
    const item = decode(row);
    let target: Document = { type: 'archived', reference: String(item.id ?? '') };
    for (const [table, type] of [
      ['users', 'user'],
      ['calendars', 'calendar'],
      ['histories', 'history'],
      ['documents', 'document'],
      ['campuses', 'campus'],
    ])
      if (maps[table]?.has(item.id)) {
        target = { type, id: ref(table, item.id) };
        break;
      }
    const history =
      target.type === 'history'
        ? (source.histories ?? []).find((h) => h._id === target.id)
        : undefined;
    const calendarId = row.calendarId
      ? ref('calendars', row.calendarId)
      : target.type === 'calendar'
        ? target.id
        : history
          ? ref('calendars', decode(history).calendarId)
          : undefined;
    const calendar = calendarId
      ? (source.calendars ?? []).find((c) => c._id === calendarId)
      : undefined;
    const campusId = calendar
      ? ref('campuses', decode(calendar).campusId)
      : item.campusId
        ? ref('campuses', item.campusId)
        : undefined;
    const actorId = maps.users.get(item.actor);
    replace('audit', row, {
      at: timestamp(item.at, 'audit.at'),
      actorId,
      actorLabel: actorId ? undefined : String(item.actor ?? ''),
      action: item.action,
      target,
      campusId,
      calendarId,
      version: item.version,
      details: item.details,
    });
  }
  for (const table of removed) {
    expected[table] = [];
    for (const row of source[table] ?? []) operations.push({ kind: 'delete', table, id: row._id });
  }
  const known = new Set([...Object.keys(expected), ...removed]);
  for (const [table, rows] of Object.entries(source))
    if (!known.has(table) && rows.length) throw Error(`Tabela de origem sem tratamento: ${table}.`);
  // The _tables registry is managed by Convex, and new table IDs are allocated
  // by the target. It is not application data and is checked via references.
  delete expected._tables;
  const batches: MigrationPlan['batches'] = [];
  let pending: Operation[] = [];
  for (const op of operations) {
    const next = [...pending, op];
    if (Buffer.byteLength(stableJson(next)) > 90_000 || next.length > 200) {
      if (!pending.length) throw Error('Documento excede o limite seguro por lote da CLI.');
      batches.push({ digest: fingerprint(pending), operations: pending });
      pending = [op];
      if (Buffer.byteLength(stableJson(pending)) > 90_000)
        throw Error('Documento excede o limite seguro por lote da CLI.');
    } else pending = next;
  }
  if (pending.length) batches.push({ digest: fingerprint(pending), operations: pending });
  const plan: MigrationPlan = {
    format: 1,
    sourceDigest,
    digest: '',
    tables: [...new Set([...Object.keys(source), ...Object.keys(expected)])].filter(
      (t) => !t.startsWith('_'),
    ),
    sourceCounts: Object.fromEntries(
      Object.entries(source)
        .filter(([t]) => t !== '_tables')
        .map(([t, rows]) => [t, rows.length]),
    ),
    sourceFingerprints: Object.fromEntries(
      Object.entries(source)
        .filter(([t]) => t !== '_tables')
        .map(([t, rows]) => [t, tableFingerprint(rows)]),
    ),
    expectedCounts: Object.fromEntries(
      Object.entries(expected).map(([t, rows]) => [t, rows.length]),
    ),
    fingerprints: Object.fromEntries(
      Object.entries(expected).map(([t, rows]) => [t, tableFingerprint(rows)]),
    ),
    batches,
    missingFiles,
  };
  plan.digest = fingerprint({ ...plan, digest: '' });
  return plan;
}

export function tableFingerprint(rows: Row[]): string {
  return fingerprint(
    rows
      .map((row) => (row._id === '<new>' ? body(row) : row))
      .map(stableJson)
      .sort(),
  );
}

export function verifyPlanSnapshot(plan: MigrationPlan, actual: Snapshot): void {
  assertPlan(plan);
  for (const [table, count] of Object.entries(plan.expectedCounts)) {
    const rows = actual[table] ?? [];
    if (rows.length !== count)
      throw Error(`Contagem divergente em ${table}: ${rows.length}, esperado ${count}.`);
    const generated = plan.batches.some((batch) =>
      batch.operations.some((op) => op.table === table && op.kind === 'insert'),
    );
    const compared = generated
      ? rows.map((row) => ({ ...row, _id: '<new>', _creationTime: 0 }))
      : rows;
    if (tableFingerprint(compared) !== plan.fingerprints[table])
      throw Error(`Conteúdo divergente em ${table}.`);
  }
  for (const [table, rows] of Object.entries(actual))
    if (
      table !== '_tables' &&
      table !== 'migrationState' &&
      !(table in plan.expectedCounts) &&
      rows.length
    )
      throw Error(`Tabela inesperada após migração: ${table}.`);
}

export function assertPlan(plan: MigrationPlan): void {
  if (
    plan.format !== 1 ||
    fingerprint({ ...plan, digest: '' }) !== plan.digest ||
    plan.batches.some((batch) => batch.digest !== fingerprint(batch.operations))
  )
    throw Error('Plano de migração adulterado ou incompleto.');
}

export function assertSourceSnapshot(plan: MigrationPlan, actual: Snapshot): void {
  assertPlan(plan);
  for (const [table, expected] of Object.entries(plan.sourceFingerprints))
    if (tableFingerprint(actual[table] ?? []) !== expected)
      throw Error(`Origem mudou em ${table}; gere um novo plano a partir do backup em manutenção.`);
  for (const [table, rows] of Object.entries(actual))
    if (table !== '_tables' && !(table in plan.sourceFingerprints) && rows.length)
      throw Error(
        `Tabela de origem não prevista no plano: ${table}. Gere um novo plano antes de migrar.`,
      );
}
