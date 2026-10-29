/** Strict offline verification of offers-v4. Unknown deltas and unknown domain errors fail closed. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, fingerprint, hexDigest } from './canonical.ts';
import type { Snapshot, SnapshotRow } from './snapshot.ts';
import { assertPresenceRuntime } from './presence-runtime.ts';
import {
  createPresenceManifest,
  presenceNamespaces,
  reconcilePresence,
} from './presence-lifecycle.ts';
import { ORACLE_SHA256, SOURCE_COMMIT, option, savePrivate } from './offers-source-projection.ts';
import type { FrozenSource } from './offers-source-projection.ts';
import {
  assertValue,
  cloneJson,
  equal,
  indexRows,
  loadDomainRuntime,
  object,
  projectSnapshot,
  readVerifiedSnapshot,
  readinessPurgeDelta,
  rows,
} from './offers-projection.ts';
import type {
  CalendarProjection,
  DomainRuntime,
  ObjectValue,
  ReadinessProjection,
} from './offers-projection.ts';

const purgedTables = [
  'reviewVersions',
  'reviews',
  'calendarVersions',
  'calendarSnapshots',
  'calendarAliases',
] as const;
const kindOrder = ['integrado', 'subsequente', 'graduacao', 'posgraduacao'];
const migrationsNamespace = '_components/migrations/migrations';
const migrationNames = [
  'purgeReviewVersions',
  'purgeReviews',
  'purgeCalendarVersions',
  'purgeCalendarSnapshots',
  'purgeAliases',
  'finalizePurge',
  'contentsToV4',
  'checkCalendars',
  'finalizeV4',
] as const;
export interface VerificationOptions {
  /** Fingerprint recorded when the independent source file was frozen, before migration. */
  frozenDigest: string;
  startedAt: number;
  finishedAt: number;
  presenceLifecycle?: boolean;
}
function without(value: ObjectValue, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}
function within(value: unknown, options: VerificationOptions, code: string) {
  assertValue(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= options.startedAt &&
      value <= options.finishedAt,
    code,
  );
}
function exactKeys(value: ObjectValue, keys: readonly string[], code: string) {
  assertValue(
    Object.keys(value).every((key) => keys.includes(key)),
    code,
  );
}
export function assertSnapshotIntegrity(snapshot: Snapshot) {
  assertValue(
    hexDigest(snapshot.sha256) && snapshot.tables._tables && snapshot.tables._storage,
    'snapshot-integral-ausente',
  );
  for (const [namespace, values] of Object.entries(snapshot.tables)) {
    assertValue(
      namespace.split('/').every((part) => part && part !== '.' && part !== '..'),
      'namespace-invalido',
    );
    if (namespace.endsWith('/_tables') || namespace === '_tables') {
      const names = values.map((row) => row.name);
      assertValue(
        names.every((name) => typeof name === 'string' && name && !name.includes('/')) &&
          new Set(names).size === names.length,
        'registry-invalido',
      );
      continue;
    }
    indexRows(values, namespace);
    for (const row of values)
      assertValue(
        typeof row._id === 'string' && row._id && Number.isFinite(row._creationTime),
        'identidade-invalida',
      );
    const split = namespace.lastIndexOf('/');
    const registryName = split < 0 ? '_tables' : `${namespace.slice(0, split)}/_tables`;
    const table = namespace.slice(split + 1);
    if (!table.startsWith('_'))
      assertValue(
        rows(snapshot, registryName).some((row) => row.name === table),
        'tabela-sem-registry',
      );
  }
  const accounted = new Set<string>();
  for (const [namespace, values] of Object.entries(snapshot.tables)) {
    if (namespace !== '_storage' && !namespace.endsWith('/_storage')) continue;
    for (const row of values) {
      const files = Object.keys(snapshot.files).filter(
        (path) =>
          path.slice(0, path.lastIndexOf('/')) === namespace &&
          path.slice(path.lastIndexOf('/') + 1).split('.')[0] === row._id,
      );
      assertValue(files.length === 1, 'bytes-storage-ausentes-ou-duplicados');
      const file = snapshot.files[files[0]!]!;
      assertValue(
        file.size === row.size &&
          hexDigest(file.sha256) &&
          [file.sha256, Buffer.from(file.sha256, 'hex').toString('base64')].includes(
            String(row.sha256),
          ),
        'bytes-storage-divergentes',
      );
      accounted.add(files[0]!);
    }
  }
  equal([...accounted].sort(), Object.keys(snapshot.files).sort(), 'storage-sem-metadados');
}
/** A deliberately independent field mapping, never the migration's converter. */
export function expectedV4(source: CalendarProjection, calendar: SnapshotRow) {
  const state = object(source.normalizedSource, 'baseline-sem-estado-normalizado');
  const modalities = calendar.modalities as string[];
  const accepted = [
    'schemaVersion',
    'rulesetVersion',
    'weekdays',
    'weekConfirmed',
    'periods',
    'events',
    'teacherDayDate',
    'teacherVacations',
    'year',
    'campus',
    'modalities',
    'offer',
    'regime',
    'organizationByModality',
    'assessmentStagesByModality',
    'intakeByModality',
    'scopeConfirmation',
    'conversion',
    'secondSemesterIntake',
  ];
  exactKeys(state, accepted, 'campo-v3-sem-destino-documentado');
  const offers = modalities.map((id) => {
    const organization = state.organizationByModality?.[id] ?? 'a-classificar';
    const count = state.assessmentStagesByModality?.[id];
    const perTerm =
      organization === 'anual' && [2, 3, 4].includes(count)
        ? count
        : organization === 'semestral' && [2, 4].includes(count)
          ? count / 2
          : undefined;
    let intake = state.intakeByModality?.[id] ? cloneJson(state.intakeByModality[id]) : undefined;
    if (
      modalities.length > 1 &&
      state.conversion?.legacySecondSemesterIntake !== undefined &&
      (!intake?.second || intake.second.status === 'unknown')
    )
      intake = { ...intake, second: { status: 'unknown' } };
    return {
      id,
      kind: id,
      delivery: 'a-conferir',
      organization,
      ...(perTerm === undefined ? {} : { stages: { perTerm } }),
      ...(organization === 'a-classificar' && [2, 3, 4].includes(count)
        ? { legacyStageCount: count }
        : {}),
      ...(state.scopeConfirmation && !source.scope.excludedIds.includes(id)
        ? { scope: state.scopeConfirmation }
        : {}),
      ...(intake === undefined ? {} : { intake }),
    };
  });
  const organizations = new Set(offers.map((offer) => offer.organization));
  const semesterPolicy =
    Number(calendar.year) === 2026 &&
    !organizations.has('a-classificar') &&
    organizations.has('semestral');
  const intakeValues = offers.map((offer) => offer.intake?.second?.status);
  const derivedSuppressed =
    intakeValues.length > 0 && intakeValues.every((value) => value === 'no');
  const oldSuppressed = state.secondSemesterIntake === false;
  const preserve = semesterPolicy && oldSuppressed !== derivedSuppressed;
  return cloneJson({
    schemaVersion: 4,
    ...(state.rulesetVersion === undefined ? {} : { rulesetVersion: state.rulesetVersion }),
    offers,
    ...(preserve ? { legacySecondSemesterIntake: !oldSuppressed } : {}),
    weekdays: state.weekdays,
    weekConfirmed: state.weekConfirmed,
    periods: state.periods.map(({ association, ...period }: ObjectValue) => ({
      ...period,
      association:
        association?.status === 'defined'
          ? {
              status: 'defined',
              offers: association.modalities,
              term: association.term,
            }
          : { status: 'a-classificar' },
    })),
    events: state.events.map(({ modalities, ...event }: ObjectValue) => ({
      ...event,
      ...(modalities === undefined ? {} : { offers: modalities }),
    })),
    ...(state.teacherDayDate === undefined ? {} : { teacherDayDate: state.teacherDayDate }),
    ...(state.teacherVacations === undefined ? {} : { teacherVacations: state.teacherVacations }),
  });
}
function removeOccurrence(values: string[], value: string, code: string) {
  const index = values.indexOf(value);
  assertValue(index >= 0, code);
  values.splice(index, 1);
}
/** Transform only the four explicitly approved stage titles from the immutable v3 row.
 * The new checklist never supplies the expected title or cycle. All other text/terms stay exact.
 */
function approvedRequirementEditorials(projection: CalendarProjection) {
  const state = object(projection.normalizedSource, 'baseline-sem-estado-normalizado');
  const labels: Record<string, string> = {
    integrado: 'Técnico integrado',
    subsequente: 'Técnico subsequente',
    graduacao: 'Graduação',
    posgraduacao: 'Pós-graduação',
  };
  return projection.requirements.map((value) => {
    const row = object(value, 'requisito-origem-invalido');
    const match = /^(stage|results|council|pedagogical-meeting)-([1-4]):([a-z][a-z0-9-]*)$/.exec(
      row.id,
    );
    if (!match) return row;
    const [, family, ordinalText, offerId] = match;
    const ordinal = Number(ordinalText);
    const organization = state.organizationByModality?.[offerId!];
    const total = state.assessmentStagesByModality?.[offerId!];
    if (
      !(organization === 'anual' && [2, 3, 4].includes(total)) &&
      !(organization === 'semestral' && [2, 4].includes(total))
    )
      return row;
    assertValue(
      state.modalities.includes(offerId) && row.modality === offerId && ordinal <= total,
      'identidade-etapa-origem-invalida',
    );
    const perTerm = organization === 'semestral' ? total / 2 : total;
    const term = organization === 'anual' ? 'annual' : ordinal <= perTerm ? 'first' : 'second';
    const termLabel =
      term === 'first' ? '1º semestre' : term === 'second' ? '2º semestre' : 'ano letivo';
    const number = organization === 'semestral' ? ((ordinal - 1) % perTerm) + 1 : ordinal;
    const cycle = total === 4 ? 'bimestral' : total === 3 ? 'trimestral' : 'semestral';
    const cycleClause = term === 'annual' ? '' : ` do ${termLabel}`;
    const title = (n: number, clause = '') =>
      family === 'stage'
        ? `${n}ª etapa de avaliação${clause} — início e término`
        : `${family === 'results' ? 'Prazo de lançamento dos resultados (rendimento e frequência)' : family === 'council' ? 'Conselho de classe/coletivo pedagógico' : 'Reunião pedagógica após os resultados parciais'} da ${n}ª etapa${clause}`;
    const normBefore = `${title(ordinal)} — ${cycle}`;
    const normAfter = `${title(number, cycleClause)} — ${cycle}`;
    const optional =
      family === 'council' && ['subsequente', 'graduacao', 'posgraduacao'].includes(offerId!)
        ? ' (opcional para esta oferta)'
        : '';
    const operationalBefore = `${title(ordinal)}${optional} — ${labels[offerId!]} (${cycle})`;
    const operationalAfter = `${title(number)}${optional} — ${labels[offerId!]}${term === 'annual' ? '' : ` — ${termLabel}`} (${cycle})`;
    const name =
      row.name === normBefore
        ? normAfter
        : row.name === operationalBefore
          ? operationalAfter
          : undefined;
    assertValue(name !== undefined, 'nome-etapa-origem-nao-previsto');
    assertValue(row.term === undefined || row.term === term, 'ciclo-etapa-origem-incompativel');
    return { ...row, name, term };
  });
}
function assertReadiness(value: unknown) {
  const readiness = object(value, 'prontidao-congelada-invalida');
  exactKeys(
    readiness,
    ['ready', 'issues', 'warnings', 'officialApproval', 'humanReview'],
    'prontidao-congelada-campo-inesperado',
  );
  assertValue(
    typeof readiness.ready === 'boolean' && readiness.officialApproval === false,
    'prontidao-congelada-flags',
  );
  for (const list of [readiness.issues, readiness.warnings])
    assertValue(
      Array.isArray(list) && list.every((message: unknown) => typeof message === 'string'),
      'prontidao-congelada-mensagens',
    );
  assertValue(readiness.ready === (readiness.issues.length === 0), 'prontidao-congelada-ready');
  const human = object(readiness.humanReview, 'revisao-humana-congelada-invalida');
  exactKeys(
    human,
    ['current', 'reviewedCriterionIds'],
    'revisao-humana-congelada-campo-inesperado',
  );
  assertValue(
    typeof human.current === 'boolean' &&
      Array.isArray(human.reviewedCriterionIds) &&
      human.reviewedCriterionIds.every((id: unknown) => typeof id === 'string'),
    'revisao-humana-congelada-formato',
  );
  return readiness as ReadinessProjection;
}
/** Reconstruct only the review-dependent contribution from the frozen old policy and real ZIP.
 * Neither the v4 readiness function nor its checklist supplies these expectations.
 */
export function verifyReviewPurgeEvidence(snapshot: Snapshot, projection: CalendarProjection) {
  const evidence = object(projection.reviewPurge, 'origem-sem-duas-prontidoes');
  exactKeys(
    evidence,
    ['reviews', 'policy', 'before', 'after', 'delta'],
    'prova-expurgo-campo-inesperado',
  );
  const reviews = rows(snapshot, 'reviews').filter(
    (review) => review.calendarId === projection.calendarId,
  );
  assertValue(reviews.length <= 1, 'pareceres-duplicados-do-calendario');
  equal(evidence.reviews, reviews, 'pareceres-reais-ausentes-da-origem');
  const policy = object(evidence.policy, 'politica-revisao-congelada-invalida');
  exactKeys(
    policy,
    ['criteria', 'evidence', 'boundRuleset', 'rulesetChanges'],
    'politica-revisao-congelada-campo-inesperado',
  );
  assertValue(
    ['coverage', 'pattern'].includes(policy.evidence) &&
      Array.isArray(policy.criteria) &&
      Array.isArray(policy.rulesetChanges) &&
      (policy.boundRuleset === undefined || typeof policy.boundRuleset === 'string'),
    'politica-revisao-congelada-formato',
  );
  const criteria = policy.criteria.map((value: unknown) => {
    const criterion = object(value, 'criterio-congelado-invalido');
    assertValue(
      typeof criterion.id === 'string' &&
        typeof criterion.title === 'string' &&
        typeof criterion.item === 'string' &&
        (criterion.pattern === null || typeof criterion.pattern === 'string'),
      'criterio-congelado-formato',
    );
    return criterion;
  });
  assertValue(
    new Set(criteria.map((criterion: ObjectValue) => criterion.id)).size === criteria.length,
    'criterio-congelado-duplicado',
  );
  const calendar = rows(snapshot, 'calendars').find((row) => row._id === projection.calendarId);
  const content = rows(snapshot, 'calendarContents').find(
    (row) => row._id === projection.contentId,
  );
  assertValue(
    calendar && content && content.calendarId === calendar._id,
    'contexto-expurgo-ausente',
  );
  const revisions = rows(snapshot, 'catalogueRevisions').filter(
    (row) => row.year === calendar.year,
  );
  assertValue(revisions.length <= 1, 'revisao-anual-duplicada');
  const catalogueRevision = revisions[0]?.revision ?? 1;
  const boundary = (version: unknown) => {
    if (version === undefined) return undefined;
    const index = policy.rulesetChanges.findIndex(
      (change: ObjectValue) => change.version === version,
    );
    if (index < 0) return version;
    return (
      policy.rulesetChanges
        .slice(0, index + 1)
        .findLast((change: ObjectValue) => ['establishes', 'tightens'].includes(change.effect))
        ?.version ?? version
    );
  };
  const review = reviews[0];
  const current = Boolean(
    review &&
    (!policy.boundRuleset ||
      review.rulesetVersion === policy.boundRuleset ||
      (review.rulesetVersion !== undefined &&
        boundary(review.rulesetVersion) === boundary(policy.boundRuleset))) &&
    review.calendarVersion === calendar.version &&
    (review.baseIdentity && projection.base.identity
      ? review.baseIdentity === projection.base.identity
      : review.catalogueRevision === catalogueRevision),
  );
  const state = object(projection.normalizedSource, 'baseline-sem-estado-normalizado');
  const events = [...(content.institutionalSnapshot as ObjectValue[]), ...state.events];
  const plain = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const token = (message: string) =>
    [...(projection.requirements as ObjectValue[])]
      .sort((a, b) => b.name.length - a.name.length)
      .reduce(
        (text, requirement) => text.replaceAll(requirement.name, `[${requirement.id}]`),
        message,
      );
  const contribution = (real: boolean) => {
    const selected = real ? review : undefined;
    const isCurrent = real && current;
    const issues: string[] = [];
    if (!isCurrent)
      issues.push('A DENTEC/PROENS precisa salvar a revisão desta versão do calendário e da base.');
    if (!(selected?.applicableNorm as string | undefined)?.trim())
      issues.push('Identifique a norma vigente aplicável na revisão.');
    if (selected) assertValue(Array.isArray(selected.entries), 'parecer-sem-criterios');
    for (const criterion of criteria) {
      const entry = isCurrent
        ? (selected!.entries as ObjectValue[]).find((item) => item.id === criterion.id)
        : undefined;
      if (!entry?.reviewed || !['ATENDIDO', 'NAO_APLICAVEL'].includes(entry.status))
        issues.push(
          `${criterion.item}: ${criterion.title} — atendimento ou não aplicabilidade aguardando confirmação.`,
        );
      if (
        policy.evidence === 'pattern' &&
        criterion.pattern &&
        entry?.status === 'ATENDIDO' &&
        !events.some((event) =>
          new RegExp(criterion.pattern).test(plain(event.name + ' ' + (event.category || ''))),
        )
      )
        issues.push(
          `${criterion.item}: ${criterion.title} — nenhum evento com data localizado no calendário; confira o cadastro.`,
        );
    }
    return {
      issues: issues.map(token).sort(),
      humanReview: {
        current: isCurrent,
        reviewedCriterionIds: isCurrent
          ? (selected!.entries as ObjectValue[])
              .filter((entry) => entry.reviewed && entry.status !== 'PENDENTE')
              .map((entry) => entry.id)
          : [],
      },
    };
  };
  const real = assertReadiness(evidence.before);
  const purged = assertReadiness(evidence.after);
  const originalContribution = contribution(true);
  const purgedContribution = contribution(false);
  equal(
    real.humanReview,
    originalContribution.humanReview,
    'prontidao-real-revisao-humana-divergente',
  );
  equal(
    purged.humanReview,
    purgedContribution.humanReview,
    'prontidao-expurgada-revisao-humana-divergente',
  );
  const commonIssues = [...real.issues];
  for (const issue of originalContribution.issues)
    removeOccurrence(commonIssues, issue, 'contribuicao-real-de-revisao-ausente');
  equal(
    {
      ...real,
      issues: [...commonIssues, ...purgedContribution.issues].sort(),
      ready: commonIssues.length + purgedContribution.issues.length === 0,
      humanReview: purgedContribution.humanReview,
    },
    purged,
    'delta-expurgo-altera-obrigacao-alheia',
  );
  equal(evidence.delta, readinessPurgeDelta(real, purged), 'delta-expurgo-congelado-divergente');
  equal(purged, projection.readiness, 'prontidao-pos-expurgo-nao-usada');
  return {
    calendarId: projection.calendarId,
    reviews: reviews.length,
    sourceReviewsDigest: fingerprint(reviews),
    beforeReadinessDigest: fingerprint(real),
    afterReadinessDigest: fingerprint(purged),
    delta: evidence.delta,
  };
}
export function compareCalendarProjection(before: CalendarProjection, after: CalendarProjection) {
  const purge = object(before.reviewPurge, 'origem-sem-duas-prontidoes');
  const realReadiness = assertReadiness(purge.before);
  const purgedReadiness = assertReadiness(purge.after);
  equal(purgedReadiness, before.readiness, 'prontidao-pos-expurgo-nao-usada');
  equal(
    purge.delta,
    readinessPurgeDelta(realReadiness, purgedReadiness),
    'delta-expurgo-congelado-divergente',
  );
  equal(approvedRequirementEditorials(before), after.requirements, 'dominio-requirements');
  const fields = ['minimums', 'counting', 'diagnostics', 'base', 'window'] as const;
  for (const field of fields) equal(before[field], after[field], `dominio-${field}`);
  assertValue(
    before.counting.status !== 'unavailable' && after.counting.status !== 'unavailable',
    'contagem-sem-prova',
  );
  assertValue(
    before.diagnostics.status === 'computed' && after.diagnostics.status === 'computed',
    'diagnostico-sem-prova',
  );
  equal(before.scope.issue, after.scope.issue, 'norma-de-escopo-alterada');
  equal(before.scope.excludedIds, after.scope.excludedIds, 'exclusoes-alteradas');
  const expectedReadiness = cloneJson(before.readiness);
  const excludedOnly =
    before.scope.issue &&
    before.scope.excludedIds.length > 0 &&
    before.scope.pendingIncludedIds.length === 0 &&
    before.normalizedSource?.modalities.length === before.scope.excludedIds.length;
  let removedScopeIssue = false;
  if (excludedOnly && before.normalizedSource?.scopeConfirmation?.status !== 'covered') {
    removeOccurrence(expectedReadiness.issues, before.scope.issue!, 'impedimento-original-ausente');
    removedScopeIssue = true;
    expectedReadiness.ready = expectedReadiness.issues.length === 0;
  }
  const actual = cloneJson(after.readiness);
  for (const warning of after.cycleWarnings)
    removeOccurrence(actual.warnings, warning, 'aviso-de-ciclo-nao-emitido');
  equal(expectedReadiness, actual, 'prontidao-divergente');
  return {
    removedScopeIssue,
    newCycleWarnings: after.cycleWarnings.length,
    counting: after.counting.status,
  };
}
function verifyRegistry(before: Snapshot, after: Snapshot) {
  const expectedNamespaces = [
    ...new Set([...Object.keys(before.tables), 'migrationReports', 'migrationResults']),
  ].sort();
  equal(expectedNamespaces, Object.keys(after.tables).sort(), 'namespaces-alterados-fora-do-plano');
  for (const namespace of Object.keys(before.tables)) {
    if (namespace !== '_tables' && !namespace.endsWith('/_tables')) continue;
    const oldRows = rows(before, namespace);
    const currentRows = rows(after, namespace);
    const current = new Map(currentRows.map((row) => [row.name, row]));
    const originalNames = new Set(oldRows.map((row) => row.name));
    for (const row of oldRows) equal(row, current.get(row.name), 'registry-anterior-alterado');
    const addedNames = currentRows
      .filter((row) => !originalNames.has(row.name))
      .map((row) => String(row.name))
      .sort();
    const permittedNames =
      namespace === '_tables'
        ? ['migrationReports', 'migrationResults'].filter((name) => !originalNames.has(name)).sort()
        : [];
    equal(permittedNames, addedNames, 'registry-alterado-fora-do-plano');
  }
}

function migrationPending(state: ObjectValue, source: CalendarProjection) {
  return state.offers.some(
    (offer: ObjectValue) =>
      offer.organization === 'a-classificar' ||
      (!source.scope.excludedIds.includes(offer.id) && offer.stages === undefined) ||
      Object.values(offer.intake ?? {}).some(
        (intake) => (intake as ObjectValue).status === 'unknown',
      ),
  );
}
function parsedDetails(row: SnapshotRow) {
  assertValue(typeof row.details === 'string', 'auditoria-sem-detalhes');
  try {
    return object(JSON.parse(row.details), 'auditoria-detalhes-invalidos');
  } catch {
    throw Error('Verificação de ofertas interrompida: auditoria-json-invalido.');
  }
}
function verifyMigrationDelta(
  before: Snapshot,
  after: Snapshot,
  frozen: FrozenSource,
  options: VerificationOptions,
) {
  const oldAudits = indexRows(rows(before, 'audit'), 'audit');
  const newAudits = indexRows(rows(after, 'audit'), 'audit');
  for (const [id, row] of oldAudits) equal(row, newAudits.get(id), 'auditoria-anterior-alterada');
  const additions = rows(after, 'audit').filter((row) => !oldAudits.has(row._id));
  const purged = Object.fromEntries(
    purgedTables.map((table) => [table, rows(before, table).length]),
  );
  const expectedAuditIds = new Set<string>();
  const purgeAudits = additions.filter((row) => row.action === 'PURGE_HISTORY_V4');
  assertValue(purgeAudits.length === 1, 'auditoria-expurgo-nao-unica');
  const purge = purgeAudits[0]!;
  equal(
    without(purge, ['_id', '_creationTime', 'at', 'details']),
    {
      action: 'PURGE_HISTORY_V4',
      target: { type: 'archived', reference: 'offers-v4:purge' },
    },
    'auditoria-expurgo-campos',
  );
  equal(parsedDetails(purge), { migration: 'offers-v4', purged }, 'auditoria-expurgo-contagens');
  expectedAuditIds.add(purge._id);
  const calendars = indexRows(rows(before, 'calendars'), 'calendars');
  const resultRows = rows(after, 'migrationResults');
  assertValue(
    rows(before, 'migrationResults').length === 0 && rows(before, 'migrationReports').length === 0,
    'origem-com-migracao-v4-anterior',
  );
  const results = new Map(resultRows.map((row) => [row.reference, row]));
  assertValue(
    results.size === resultRows.length &&
      resultRows.length === rows(before, 'calendarContents').length,
    'recibos-por-conteudo-divergentes',
  );
  let pending = 0;
  for (const content of rows(before, 'calendarContents')) {
    const calendar = calendars.get(String(content.calendarId))!;
    const projection = frozen.projection.calendars[calendar._id]!;
    const state = expectedV4(projection, calendar);
    const isPending = migrationPending(state, projection);
    pending += Number(isPending);
    const result = results.get(`content:${content._id}`);
    assertValue(result, 'recibo-de-conversao-ausente');
    equal(
      without(result, ['_id', '_creationTime']),
      {
        key: 'offers-v4',
        reference: `content:${content._id}`,
        contentId: content._id,
        calendarId: calendar._id,
        outcome: 'converted',
        pending: isPending,
        orphanKeys: 0,
        sourceSchemaVersion: object(content.state, 'estado-origem').schemaVersion ?? 2,
        oldStateHash: fingerprint(content.state),
      },
      'recibo-de-conversao-divergente',
    );
    const matching = additions.filter(
      (row) => row.action === 'MIGRATE_CONTENT_V4' && row.calendarId === calendar._id,
    );
    assertValue(matching.length === 1, 'auditoria-conversao-nao-unica');
    const audit = matching[0]!;
    equal(
      without(audit, ['_id', '_creationTime', 'at', 'details']),
      {
        action: 'MIGRATE_CONTENT_V4',
        target: { type: 'calendar', id: calendar._id },
        campusId: calendar.campusId,
        calendarId: calendar._id,
        version: calendar.version,
      },
      'auditoria-conversao-campos',
    );
    equal(
      parsedDetails(audit),
      {
        migration: 'offers-v4',
        sourceSchemaVersion: object(content.state, 'estado-origem').schemaVersion ?? 2,
        oldStateHash: fingerprint(content.state),
      },
      'auditoria-conversao-hash',
    );
    expectedAuditIds.add(audit._id);
    within(result._creationTime, options, 'data-recibo-conversao');
  }
  equal(
    [...expectedAuditIds].sort(),
    additions.map((row) => row._id).sort(),
    'auditoria-nova-fora-do-plano',
  );
  for (const audit of additions) {
    within(audit.at, options, 'data-auditoria');
    within(audit._creationTime, options, 'criacao-auditoria');
  }
  const reports = rows(after, 'migrationReports');
  assertValue(reports.length === 1, 'relatorio-migracao-nao-unico');
  const report = reports[0]!;
  equal(
    without(report, ['_id', '_creationTime', 'startedAt', 'completedAt']),
    {
      key: 'offers-v4',
      converted: resultRows.length,
      alreadyV4: 0,
      pending,
      orphanContents: 0,
      orphanCalendars: 0,
      orphanKeys: 0,
      failures: 0,
      purged,
      purgeAuditId: purge._id,
    },
    'contadores-migracao-divergentes',
  );
  within(report._creationTime, options, 'criacao-relatorio');
  within(report.startedAt, options, 'inicio-relatorio');
  within(report.completedAt, options, 'fim-relatorio');
  assertValue(Number(report.completedAt) >= Number(report.startedAt), 'relatorio-tempo-invertido');
  const oldMigrations = indexRows(rows(before, migrationsNamespace), migrationsNamespace);
  const finalMigrations = indexRows(rows(after, migrationsNamespace), migrationsNamespace);
  for (const [id, row] of oldMigrations)
    equal(row, finalMigrations.get(id), 'migracao-anterior-alterada');
  const added = rows(after, migrationsNamespace).filter((row) => !oldMigrations.has(row._id));
  const expectedProcessed: Record<string, number> = {
    purgeReviewVersions: purged.reviewVersions!,
    purgeReviews: purged.reviews!,
    purgeCalendarVersions: purged.calendarVersions!,
    purgeCalendarSnapshots: purged.calendarSnapshots!,
    purgeAliases: purged.calendarAliases!,
    finalizePurge: 1,
    contentsToV4: resultRows.length,
    checkCalendars: calendars.size,
    finalizeV4: 1,
  };
  equal(
    added.map((row) => String(row.name)).sort(),
    migrationNames.map((name) => `migrations:${name}`).sort(),
    'componente-migracoes-incompleto',
  );
  for (const row of added) {
    exactKeys(
      row,
      [
        '_id',
        '_creationTime',
        'name',
        'cursor',
        'isDone',
        'workerId',
        'processed',
        'latestStart',
        'latestEnd',
      ],
      'componente-migracoes-campo-inesperado',
    );
    const name = String(row.name).slice('migrations:'.length);
    assertValue(
      row.isDone === true &&
        row.processed === expectedProcessed[name] &&
        (row.cursor === null || typeof row.cursor === 'string'),
      'componente-migracao-nao-concluida',
    );
    within(row._creationTime, options, 'criacao-componente-migracao');
    within(row.latestStart, options, 'inicio-componente-migracao');
    within(row.latestEnd, options, 'fim-componente-migracao');
    assertValue(
      Number(row.latestEnd) >= Number(row.latestStart),
      'componente-migracao-tempo-invertido',
    );
    if (row.workerId !== undefined)
      assertValue(typeof row.workerId === 'string' && row.workerId, 'worker-de-migracao-invalido');
  }
  return {
    converted: resultRows.length,
    pending,
    purged,
    addedAuditRows: additions.length,
    componentMigrations: added.length,
  };
}
export async function verifySnapshots(
  before: Snapshot,
  after: Snapshot,
  frozen: FrozenSource,
  runtime: DomainRuntime,
  options: VerificationOptions,
) {
  assertValue(
    Number.isFinite(options.startedAt) &&
      Number.isFinite(options.finishedAt) &&
      options.startedAt <= options.finishedAt,
    'janela-de-operacao-invalida',
  );
  assertValue(
    hexDigest(options.frozenDigest) && fingerprint(frozen) === options.frozenDigest,
    'baseline-congelado-divergente',
  );
  assertValue(
    frozen.format === 2 &&
      frozen.oracleSha256 === ORACLE_SHA256 &&
      frozen.sourceCommit === SOURCE_COMMIT,
    'origem-nao-independente',
  );
  equal(frozen.snapshotSha256, before.sha256, 'backup-nao-corresponde-a-origem');
  equal(frozen.projection.snapshotSha256, before.sha256, 'projecao-de-outro-backup');
  equal(fingerprint(frozen.projection), frozen.projectionDigest, 'projecao-congelada-alterada');
  assertValue(
    runtime.mode === 'current-v4' && frozen.projection.mode === 'source-v3',
    'modos-de-projecao-invalidos',
  );
  assertSnapshotIntegrity(before);
  assertSnapshotIntegrity(after);
  const reviewPurge = Object.values(frozen.projection.calendars).map((projection) =>
    verifyReviewPurgeEvidence(before, projection),
  );
  const sourceInventory = frozen.projection.inventory;
  assertValue(
    sourceInventory.contentsWithoutCalendar === 0 &&
      sourceInventory.calendarsWithoutContent === 0 &&
      sourceInventory.orphanMapKeys === 0,
    'perda-orfa-sem-justificativa',
  );
  const calendarIndex = indexRows(rows(before, 'calendars'), 'calendars');
  const afterCalendars = indexRows(rows(after, 'calendars'), 'calendars');
  equal(
    [...calendarIndex.keys()].sort(),
    [...afterCalendars.keys()].sort(),
    'identidades-calendarios',
  );
  for (const [id, calendar] of calendarIndex) {
    equal(
      {
        ...without(calendar, ['modalities']),
        offerKinds: kindOrder.filter((kind) => (calendar.modalities as string[]).includes(kind)),
      },
      afterCalendars.get(id),
      'metadados-calendario',
    );
  }
  const sourceContents = indexRows(rows(before, 'calendarContents'), 'calendarContents');
  const finalContents = indexRows(rows(after, 'calendarContents'), 'calendarContents');
  equal(
    [...sourceContents.keys()].sort(),
    [...finalContents.keys()].sort(),
    'identidades-conteudos',
  );
  equal(
    Object.keys(frozen.projection.calendars).sort(),
    [...calendarIndex.keys()].sort(),
    'baseline-calendarios-incompleto',
  );
  for (const [id, content] of sourceContents) {
    const final = finalContents.get(id)!;
    equal(without(content, ['state']), without(final, ['state']), 'metadados-conteudo');
    const calendar = calendarIndex.get(String(content.calendarId))!;
    equal(
      expectedV4(frozen.projection.calendars[calendar._id]!, calendar),
      final.state,
      'mapeamento-integral-v4',
    );
  }
  for (const table of purgedTables)
    assertValue(rows(after, table).length === 0, `expurgo-incompleto-${table}`);
  verifyRegistry(before, after);
  equal(before.files, after.files, 'storage-alterado-sem-prova');
  const presenceChanged = presenceNamespaces.some(
    (namespace) => canonical(rows(before, namespace)) !== canonical(rows(after, namespace)),
  );
  let presence: ReturnType<typeof reconcilePresence> = [];
  if (presenceChanged) {
    assertValue(options.presenceLifecycle, 'presenca-alterada-sem-opt-in');
    assertPresenceRuntime();
    presence = reconcilePresence(createPresenceManifest(before.tables), after.tables);
  }
  const allowed = new Set<string>([
    'calendars',
    'calendarContents',
    'audit',
    'migrationReports',
    'migrationResults',
    migrationsNamespace,
    ...purgedTables,
  ]);
  if (presenceChanged) for (const namespace of presenceNamespaces) allowed.add(namespace);
  for (const namespace of new Set([...Object.keys(before.tables), ...Object.keys(after.tables)])) {
    if (allowed.has(namespace) || namespace === '_tables' || namespace.endsWith('/_tables'))
      continue;
    equal(
      [...rows(before, namespace)].sort((a, b) => a._id.localeCompare(b._id)),
      [...rows(after, namespace)].sort((a, b) => a._id.localeCompare(b._id)),
      `preservacao-${namespace}`,
    );
  }
  const migration = verifyMigrationDelta(before, after, frozen, options);
  const actual = projectSnapshot(after, runtime);
  const comparisons = Object.keys(frozen.projection.calendars).map((id) =>
    compareCalendarProjection(frozen.projection.calendars[id]!, actual.calendars[id]!),
  );
  return {
    format: 1,
    result: 'verified',
    beforeSha256: before.sha256,
    afterSha256: after.sha256,
    frozenDigest: options.frozenDigest,
    oracleSha256: ORACLE_SHA256,
    sourceCommit: frozen.sourceCommit,
    counts: {
      calendars: comparisons.length,
      countingComputed: comparisons.filter((row) => row.counting === 'computed').length,
      countingPendingWithProof: comparisons.filter((row) => row.counting === 'pending').length,
      removedExcludedScopeIssues: comparisons.filter((row) => row.removedScopeIssue).length,
      newCycleWarnings: comparisons.reduce((sum, row) => sum + row.newCycleWarnings, 0),
    },
    sourceInventory,
    reviewPurge,
    migratedInventory: actual.inventory,
    migration,
    presence,
  };
}
async function main() {
  const frozen = JSON.parse(readFileSync(option('source'), 'utf8')) as FrozenSource;
  const value = (name: string) => process.argv[process.argv.indexOf(`--${name}`) + 1];
  const runtime = await loadDomainRuntime(option('code-root'), 'current-v4');
  const report = await verifySnapshots(
    readVerifiedSnapshot(option('before')),
    readVerifiedSnapshot(option('after')),
    frozen,
    runtime,
    {
      frozenDigest: value('source-digest') ?? '',
      startedAt: Number(value('started-at')),
      finishedAt: Number(value('finished-at')),
      presenceLifecycle: process.argv.includes('--presence-lifecycle'),
    },
  );
  savePrivate(option('out'), report);
  console.log(
    `Migração v4 verificada: ${report.counts.calendars} calendários; ${report.counts.countingComputed} contagens calculadas; ${report.counts.countingPendingWithProof} pendências comprovadas.`,
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error && error.message.startsWith('Verificação de ofertas interrompida:')
        ? error.message
        : 'Verificação v4 interrompida; confira os artefatos privados e o cálculo do domínio.',
    );
    process.exitCode = 1;
  });
}
