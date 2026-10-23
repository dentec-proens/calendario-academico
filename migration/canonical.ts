/** Offline, identity-preserving migration from historical representations to schema 2. */
import { createHash } from 'node:crypto';
import type { Document, MigrationPlan, Operation, Row, Snapshot } from './types.ts';

const writable = new Set(['calendarContents', 'calendarSnapshots', 'institutionalEvents']);
const modalities = new Set(['integrado', 'subsequente', 'graduacao', 'posgraduacao']);
const scoped = /^(stage|results|council|pedagogical-meeting)-([1-4])$/;
const vacation = /^teacher-vacation-(january|july|third)$/;
const creationName = 'Criação do IFPR e da Rede Federal de EPT';

function json(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(json).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${json((value as Document)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(json(value)).digest('hex');
const tableDigest = (rows: Row[]) => digest(rows.map(json).sort());
const equal = (a: unknown, b: unknown) => json(a) === json(b);
function object(value: unknown, label: string): Document {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`Objeto inválido: ${label}.`);
  return value as Document;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw Error(`Lista inválida: ${label}.`);
  return value;
}
function scope(value: unknown, label: string): string[] {
  const result = array(value, label);
  if (result.some((m) => typeof m !== 'string' || !modalities.has(m)))
    throw Error(`Modalidade desconhecida em ${label}; conversão manual necessária.`);
  if (new Set(result).size !== result.length) throw Error(`Escopo duplicado em ${label}.`);
  return result as string[];
}
function stateModalities(state: Document): string[] {
  const result =
    state.modalities === undefined
      ? scope([state.offer], 'offer')
      : scope(state.modalities, 'modalities');
  if (!result.length) throw Error('Estado sem modalidade; conversão ambígua.');
  if (typeof state.offer !== 'string' || !result.includes(state.offer))
    throw Error('Oferta principal divergente das modalidades.');
  return result;
}
function stageMap(state: Document, forms: string[]): Document {
  if (state.assessmentStagesByModality !== undefined) {
    const map = object(state.assessmentStagesByModality, 'assessmentStagesByModality');
    for (const [m, n] of Object.entries(map))
      if (
        !modalities.has(m) ||
        !forms.includes(m) ||
        ![2, 3, 4].includes(Number(n)) ||
        typeof n !== 'number'
      )
        throw Error('Quantidade de etapas ou modalidade inválida.');
    if (
      state.assessmentStages !== undefined &&
      forms.some((m) => map[m] !== state.assessmentStages)
    )
      throw Error('Contagem comum e mapa por modalidade conflitantes.');
    return map;
  }
  if (state.assessmentStages === undefined) return {};
  if (typeof state.assessmentStages !== 'number' || ![2, 3, 4].includes(state.assessmentStages))
    throw Error('Quantidade comum de etapas inválida.');
  return Object.fromEntries(forms.map((m) => [m, state.assessmentStages]));
}
function creation(event: Document): boolean {
  return (
    event.category === 'institucional' &&
    ['ifpr2027-21', 'inst:ifpr2027-21'].includes(String(event.id ?? event.code)) &&
    event.name === creationName
  );
}
function normalizeEvent(value: unknown, forms?: string[], stages?: Document): Document {
  const event = object(value, 'evento');
  const result = { ...event };
  if (event.historicalSource !== undefined) {
    const source = object(event.historicalSource, 'historicalSource');
    if (typeof source.candidateKey !== 'string' || !source.candidateKey)
      throw Error('Vínculo histórico sem candidateKey; conversão manual necessária.');
  }
  if (event.offers !== undefined) {
    const old = scope(event.offers, 'evento.offers');
    if (event.modalities !== undefined) {
      const current = scope(event.modalities, 'evento.modalities');
      if (current.length && !equal([...current].sort(), [...old].sort()))
        throw Error('Escopos offers/modalities conflitantes.');
    }
    result.modalities = old;
    delete result.offers;
  } else if (event.modalities !== undefined) scope(event.modalities, 'evento.modalities');
  if (vacation.test(String(event.id)) && event.kind === 'note') result.kind = 'exclude';
  if (creation(event)) result.category = 'criacao';
  const requirement = typeof event.requirementId === 'string' ? event.requirementId : '';
  if (/^stage-(start|end)-/.test(requirement))
    throw Error('Etapas em pares exigem conversão manual para preservar identidades.');
  const match = scoped.exec(requirement);
  if (match) {
    if (!forms || !stages) throw Error('Vínculo de etapa fora de um estado de calendário.');
    const eventScope =
      result.modalities === undefined ? forms : scope(result.modalities, 'escopo da etapa');
    const applicable = eventScope.length ? forms.filter((m) => eventScope.includes(m)) : forms;
    if (
      applicable.length !== 1 ||
      Number(stages[applicable[0]]) < Number(match[2]) ||
      stages[applicable[0]] === undefined
    )
      throw Error('Vínculo de etapa sem modalidade ou contagem inequívoca.');
    result.requirementId = `${requirement}:${applicable[0]}`;
    result.modalities = [applicable[0]];
  }
  return result;
}
function normalizeState(value: unknown, historical: boolean): Document {
  const state = object(value, 'estado');
  if (historical && state.schemaVersion !== 1 && state.schemaVersion !== 2)
    throw Error('Versão desconhecida do estado histórico.');
  const forms = historical ? stateModalities(state) : undefined;
  const map = stageMap(
    state,
    forms ?? Object.keys(object(state.assessmentStagesByModality, 'assessmentStagesByModality')),
  );
  if (state.teacherVacations !== undefined) {
    const periods = object(state.teacherVacations, 'teacherVacations');
    if ('julyStart' in periods) throw Error('Férias antigas exigem conversão manual de datas.');
  }
  const ignored =
    state.ignoredHistory === undefined ? [] : array(state.ignoredHistory, 'ignoredHistory');
  if (ignored.some((key) => typeof key !== 'string')) throw Error('Decisão histórica inválida.');
  const result: Document = {
    ...state,
    assessmentStagesByModality: { ...map },
    ignoredHistory: [...ignored],
    events: array(state.events, 'events').map((event) => normalizeEvent(event, forms, map)),
  };
  if (historical) {
    result.schemaVersion = 2;
    result.modalities = forms;
  }
  delete result.assessmentStages;
  return result;
}

/** Never edits its input. Unknown tables, Auth, Storage and complete review rows stay intact. */
export function canonicalSnapshot(source: Snapshot): Snapshot {
  const result = structuredClone(source);
  for (const row of result.calendarContents ?? []) {
    row.state = normalizeState(row.state, false);
    row.institutionalSnapshot = array(row.institutionalSnapshot, 'institutionalSnapshot').map(
      (event) => normalizeEvent(event),
    );
  }
  for (const row of result.calendarSnapshots ?? []) {
    row.state = normalizeState(row.state, true);
    row.institutionalEvents = array(row.institutionalEvents, 'institutionalEvents').map((event) =>
      normalizeEvent(event),
    );
  }
  for (const row of result.institutionalEvents ?? []) {
    scope(row.modalities, 'institutionalEvents.modalities');
    if (creation(row)) row.category = 'criacao';
  }
  for (const table of ['calendars', 'histories'])
    for (const row of result[table] ?? []) scope(row.modalities, `${table}.modalities`);
  return result;
}

export type CanonicalReport = {
  tables: number;
  documents: number;
  changedByTable: Record<string, number>;
  states: number;
  unknownAssessmentStates: number;
  preservedReviews: number;
};

function without(value: Document, keys: string[]): Document {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}
function assertEqual(a: unknown, b: unknown, label: string): void {
  if (!equal(a, b)) throw Error(`Equivalência não comprovada: ${label}.`);
}
function eventMeaning(value: unknown, state?: Document): Document {
  const event = object(value, 'evento');
  const forms = state ? stateModalities(state) : [];
  const ownScope =
    event.modalities === undefined || !scope(event.modalities, 'modalities').length
      ? event.offers === undefined
        ? []
        : scope(event.offers, 'offers')
      : scope(event.modalities, 'modalities');
  const effectiveScope = ownScope.length ? ownScope : forms;
  const req = typeof event.requirementId === 'string' ? event.requirementId : '';
  return {
    ...without(event, ['kind', 'category', 'modalities', 'offers', 'requirementId']),
    kind: vacation.test(String(event.id)) && event.kind === 'note' ? 'exclude' : event.kind,
    category: creation(event) ? 'criacao' : (event.category ?? null),
    scope: [...effectiveScope].sort(),
    requirement:
      scoped.test(req) && effectiveScope.length === 1 ? `${req}:${effectiveScope[0]}` : req,
  };
}
function verifyState(before: unknown, after: unknown, historical: boolean): boolean {
  const a = object(before, 'estado anterior'),
    b = object(after, 'estado convertido');
  const representation = [
    'events',
    'assessmentStages',
    'assessmentStagesByModality',
    'ignoredHistory',
  ];
  if (historical) representation.push('schemaVersion', 'modalities');
  assertEqual(without(a, representation), without(b, representation), 'conteúdo do estado');
  const forms = historical ? stateModalities(a) : [];
  if (historical) {
    assertEqual(b.schemaVersion, 2, 'schemaVersion');
    assertEqual(b.modalities, forms, 'modalidades');
  }
  assertEqual(a.ignoredHistory ?? [], b.ignoredHistory, 'decisões históricas');
  const map = historical ? stageMap(a, forms) : a.assessmentStagesByModality;
  assertEqual(map, b.assessmentStagesByModality, 'quantidades de etapas/estado desconhecido');
  if ('assessmentStages' in b) throw Error('Contagem comum não foi removida.');
  assertEqual(
    array(a.events, 'events').map((e) => eventMeaning(e, historical ? a : undefined)),
    array(b.events, 'events').map((e) => eventMeaning(e, historical ? b : undefined)),
    'identidades, vínculos, conteúdo e escopos dos eventos',
  );
  return (
    Object.keys(object(b.assessmentStagesByModality, 'assessmentStagesByModality')).length === 0
  );
}

/** Independent invariant audit: only representation fields can differ; no identities are masked. */
export function verifyCanonicalEquivalence(source: Snapshot, actual: Snapshot): CanonicalReport {
  const normalized = canonicalSnapshot(actual);
  for (const table of writable)
    assertEqual(actual[table] ?? [], normalized[table] ?? [], `formato canônico de ${table}`);
  const report: CanonicalReport = {
    tables: 0,
    documents: 0,
    changedByTable: {},
    states: 0,
    unknownAssessmentStates: 0,
    preservedReviews: 0,
  };
  // Registry entries describe the deployment, while migrationState is the
  // temporary engine checkpoint. Neither is application history or content.
  const tables = new Set([...Object.keys(source), ...Object.keys(actual)]);
  for (const table of tables) {
    if (table === '_tables' || table === 'migrationState') continue;
    const rows = source[table] ?? [];
    report.tables++;
    const converted = actual[table] ?? [];
    assertEqual(rows.length, converted.length, `contagem de ${table}`);
    const ids = new Map(converted.map((row) => [row._id, row]));
    if (ids.size !== rows.length) throw Error(`Identidade duplicada em ${table}.`);
    for (const row of rows) {
      report.documents++;
      const next = ids.get(row._id);
      if (!next) throw Error(`Identidade ausente em ${table}.`);
      if (!equal(row, next)) report.changedByTable[table] = (report.changedByTable[table] ?? 0) + 1;
      if (!writable.has(table)) assertEqual(row, next, `preservação integral de ${table}`);
      else if (table === 'institutionalEvents') {
        assertEqual(
          without(row, ['category']),
          without(next, ['category']),
          'registro do catálogo',
        );
        assertEqual(eventMeaning(row), eventMeaning(next), 'categoria visual do catálogo');
      } else {
        const field =
          table === 'calendarContents' ? 'institutionalSnapshot' : 'institutionalEvents';
        assertEqual(
          without(row, ['state', field]),
          without(next, ['state', field]),
          `metadados de ${table}`,
        );
        assertEqual(
          array(row[field], field).map((e) => eventMeaning(e)),
          array(next[field], field).map((e) => eventMeaning(e)),
          'snapshot institucional',
        );
        report.states++;
        if (verifyState(row.state, next.state, table === 'calendarSnapshots'))
          report.unknownAssessmentStates++;
      }
      if (table === 'reviews' || table === 'reviewVersions') report.preservedReviews++;
    }
  }
  return report;
}

export function createCanonicalPlan(source: Snapshot, sourceDigest: string): MigrationPlan {
  const expected = canonicalSnapshot(source);
  verifyCanonicalEquivalence(source, expected);
  const operations: Operation[] = [];
  for (const [table, rows] of Object.entries(expected)) {
    if (!writable.has(table)) continue;
    const prior = new Map((source[table] ?? []).map((row) => [row._id, row]));
    for (const row of rows) {
      if (equal(prior.get(row._id), row)) continue;
      const { _id, _creationTime, ...document } = row;
      operations.push({ kind: 'replace', table, id: _id, document });
    }
  }
  const batches: MigrationPlan['batches'] = [];
  let pending: Operation[] = [];
  for (const operation of operations) {
    if (Buffer.byteLength(json([operation])) > 90_000)
      throw Error('Documento excede o limite seguro do lote.');
    if (
      pending.length &&
      (pending.length >= 200 || Buffer.byteLength(json([...pending, operation])) > 90_000)
    ) {
      batches.push({ digest: digest(pending), operations: pending });
      pending = [];
    }
    pending.push(operation);
  }
  if (pending.length) batches.push({ digest: digest(pending), operations: pending });
  const tables = Object.keys(source).filter(
    (table) => table !== '_tables' && table !== 'migrationState',
  );
  const counts = Object.fromEntries(tables.map((table) => [table, source[table].length]));
  const plan: MigrationPlan = {
    format: 1,
    sourceDigest,
    digest: '',
    tables: tables.filter((table) => !table.startsWith('_')),
    sourceCounts: counts,
    sourceFingerprints: Object.fromEntries(
      tables.map((table) => [table, tableDigest(source[table])]),
    ),
    expectedCounts: { ...counts },
    fingerprints: Object.fromEntries(tables.map((table) => [table, tableDigest(expected[table])])),
    batches,
    missingFiles: ['histories', 'documents'].flatMap((table) =>
      (source[table] ?? [])
        .filter((row) => row.unavailableFile !== undefined)
        .map((row) => {
          if (typeof row.filename !== 'string') throw Error('Arquivo indisponível sem nome.');
          return { table, id: row._id, filename: row.filename };
        }),
    ),
  };
  plan.digest = digest({ ...plan, digest: '' });
  return plan;
}
