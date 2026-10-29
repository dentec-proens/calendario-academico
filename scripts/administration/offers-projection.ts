/** Private semantic boundary shared by the archived v3 source and the v4 verifier. */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { readSnapshot } from './snapshot.ts';
import { pathToFileURL } from 'node:url';
import { canonical, fingerprint } from './canonical.ts';
import type { Snapshot, SnapshotRow } from './snapshot.ts';

// An archived module deliberately has no dependency on the current domain's transport types.
export type ObjectValue = Record<string, any>;
type ModuleValue = Record<string, (...args: any[]) => any>;
export type DomainRuntime = {
  mode: 'source-v3' | 'current-v4';
  base: ModuleValue;
  checklist: ModuleValue;
  diagnostics: ModuleValue;
  evaluation: ModuleValue;
  policy: ModuleValue;
  readiness: ModuleValue;
  conversion?: ModuleValue;
};
export type Calculation =
  | { status: 'computed'; value: unknown }
  | { status: 'pending'; codes: string[]; evidenceHash: string }
  | { status: 'unavailable'; errorHash: string };
export interface ReadinessProjection {
  ready: boolean;
  issues: string[];
  warnings: string[];
  officialApproval: boolean;
  humanReview: { current: boolean; reviewedCriterionIds: string[] };
}
export interface ReadinessPurgeDelta {
  issues: { added: string[]; removed: string[] };
  warnings: { added: string[]; removed: string[] };
  ready: { before: boolean; after: boolean };
  humanReview: {
    before: ReadinessProjection['humanReview'];
    after: ReadinessProjection['humanReview'];
  };
  officialApproval: { before: boolean; after: boolean };
}
export interface ReviewPurgeEvidence {
  reviews: SnapshotRow[];
  policy: {
    criteria: ObjectValue[];
    evidence: 'coverage' | 'pattern';
    boundRuleset?: string;
    rulesetChanges: ObjectValue[];
  };
  before: ReadinessProjection;
  after: ReadinessProjection;
  delta: ReadinessPurgeDelta;
}
export function readinessPurgeDelta(
  before: ReadinessProjection,
  after: ReadinessProjection,
): ReadinessPurgeDelta {
  const difference = (left: string[], right: string[]) => {
    const remaining = [...left];
    const added: string[] = [];
    for (const value of right) {
      const index = remaining.indexOf(value);
      if (index < 0) added.push(value);
      else remaining.splice(index, 1);
    }
    return { added: added.sort(), removed: remaining.sort() };
  };
  return cloneJson({
    issues: difference(before.issues, after.issues),
    warnings: difference(before.warnings, after.warnings),
    ready: { before: before.ready, after: after.ready },
    humanReview: { before: before.humanReview, after: after.humanReview },
    officialApproval: { before: before.officialApproval, after: after.officialApproval },
  });
}
export interface CalendarProjection {
  calendarId: string;
  contentId: string;
  normalizedSource?: ObjectValue;
  requirements: unknown[];
  minimums: Record<string, unknown>;
  counting: Calculation;
  diagnostics: Calculation;
  base: { identity: string; compatible: boolean; kind: string };
  window: unknown;
  readiness: ReadinessProjection;
  /** Both states are frozen by the old runtime, before any v4 comparison. */
  reviewPurge?: ReviewPurgeEvidence;
  scope: {
    issue?: string;
    excludedIds: string[];
    pendingIncludedIds: string[];
  };
  cycleWarnings: string[];
}
export interface DomainProjection {
  format: 1;
  snapshotSha256: string;
  mode: DomainRuntime['mode'];
  calendars: Record<string, CalendarProjection>;
  inventory: {
    v2: number;
    contentsWithoutCalendar: number;
    calendarsWithoutContent: number;
    orphanMapKeys: number;
    withoutStages: number;
    unclassifiedOffersWithKnownStageCount: number;
    semesterWithThreeStages: number;
    yearThrough2026: number;
    legacyIntakeDecisions: number;
    nonEventRecords: number;
    legacyRequirementIds: Record<string, number>;
  };
}
/** Inspect every ZIP entry before the standard reader can collapse duplicate names. */
export function readVerifiedSnapshot(path: string): Snapshot {
  const seen = new Set<string>();
  unzipSync(readFileSync(path), {
    filter: ({ name }) => {
      const components = name.replace(/\/$/, '').split('/');
      assertValue(!seen.has(name), 'entrada-zip-duplicada');
      assertValue(
        components.every(
          (part) =>
            part &&
            part !== '.' &&
            part !== '..' &&
            part !== '__proto__' &&
            part !== 'constructor' &&
            part !== 'prototype',
        ),
        'caminho-zip-invalido',
      );
      seen.add(name);
      return false;
    },
  });
  return readSnapshot(path);
}
export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function assertValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`Verificação de ofertas interrompida: ${code}.`);
}
export function object(value: unknown, code: string): ObjectValue {
  assertValue(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  return value as ObjectValue;
}
export function rows(snapshot: Snapshot, table: string): SnapshotRow[] {
  return snapshot.tables[table] ?? [];
}
export function indexRows(values: SnapshotRow[], code: string) {
  const result = new Map(values.map((row) => [row._id, row]));
  assertValue(result.size === values.length, `identidade-duplicada-${code}`);
  return result;
}
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
export const equal = (a: unknown, b: unknown, code: string) =>
  assertValue(canonical(a) === canonical(b), code);
function calculate(
  run: () => unknown,
  pending?: { codes: string[]; evidenceHash: string; messages: string[] },
): Calculation {
  try {
    return { status: 'computed', value: cloneJson(run()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pending?.messages.includes(message))
      return {
        status: 'pending',
        codes: pending.codes,
        evidenceHash: pending.evidenceHash,
      };
    return { status: 'unavailable', errorHash: fingerprint(message) };
  }
}
export async function loadDomainRuntime(
  codeRoot: string,
  mode: DomainRuntime['mode'],
): Promise<DomainRuntime> {
  const load = (path: string): Promise<ModuleValue> =>
    import(pathToFileURL(join(codeRoot, path)).href);
  const [base, checklist, diagnostics, evaluation, policy, readiness, extra] = await Promise.all([
    load('src/domain/calendar/base.ts'),
    load('src/domain/calendar/activities/checklist.ts'),
    load('src/domain/calendar/diagnostics.ts'),
    load('src/domain/calendar/counting/evaluation.ts'),
    load('src/domain/policies/registry.ts'),
    load('src/domain/calendar/readiness.ts'),
    mode === 'source-v3'
      ? load('src/domain/calendar/normalization/conversion.ts')
      : Promise.resolve(undefined),
  ]);
  return {
    mode,
    base,
    checklist,
    diagnostics,
    evaluation,
    policy,
    readiness,
    ...(mode === 'source-v3' ? { conversion: extra } : {}),
  };
}
function catalogue(snapshot: Snapshot, year: number) {
  const revisions = rows(snapshot, 'catalogueRevisions').filter((row) => row.year === year);
  assertValue(revisions.length <= 1, 'revisao-anual-duplicada');
  return {
    revision: Number(revisions[0]?.revision ?? 1),
    events: rows(snapshot, 'institutionalEvents')
      .filter((row) => row.year === year)
      .map(({ code, name, start, end, kind, category, evidence, modalities, active }) => ({
        id: code,
        name,
        start,
        end,
        kind,
        category,
        evidence,
        modalities,
        active,
      })),
  };
}
function documents(snapshot: Snapshot, year: number) {
  const selected = rows(snapshot, 'documents').filter(
    (row) => row.year === year && row.status === 'vigente',
  );
  for (const type of ['norma', 'referencia', 'parecer'])
    assertValue(
      selected.filter((row) => row.type === type).length <= 1,
      'documento-vigente-duplicado',
    );
  return selected.map(({ _id, _creationTime: _created, ...fields }) => ({
    id: _id,
    ...fields,
  }));
}
function lexicalToken(message: string, requirements: ObjectValue[], offers: ObjectValue[]) {
  let value = [...requirements]
    .sort((a, b) => b.name.length - a.name.length)
    .reduce(
      (text, requirement) => text.replaceAll(requirement.name, `[${requirement.id}]`),
      message,
    );
  const offer = offers.find((item) => value.startsWith(`${item.label} — `));
  if (offer)
    value = value.replace(
      /\[((?:stage|results|council|pedagogical-meeting)-[1-4]):[a-z][a-z0-9-]*\]/g,
      `[$1:${offer.id}]`,
    );
  // The annual ordinal remains the persisted identity when displayed numbering restarts.
  if (offer?.organization === 'semestral' && offer.perTerm) {
    value = value.replace(
      /(\d)ª etapa — ([12])º semestre:/g,
      (_match, number: string, term: string) =>
        `${(Number(term) - 1) * offer.perTerm + Number(number)}ª etapa:`,
    );
  }
  return value;
}
/** Independent consistency proof: no call to the implementation producing readiness warnings. */
function independentlyCheckStageCycle(
  state: ObjectValue,
  offer: ObjectValue,
  event: ObjectValue,
  ordinal: number,
): string | undefined {
  const termFor = (n: number) =>
    offer.organization === 'anual' ? 'annual' : n <= offer.stages.perTerm ? 'first' : 'second';
  const term = termFor(ordinal);
  const labels: Record<string, string> = {
    annual: 'ano letivo',
    first: '1º semestre',
    second: '2º semestre',
  };
  const periods = state.periods.filter(
    (period: ObjectValue) =>
      period.association?.status === 'defined' &&
      period.association.offers.includes(offer.id) &&
      period.association.term === term,
  );
  if (
    event.start > event.end ||
    !periods.some((period: ObjectValue) => period.start <= event.start && event.end <= period.end)
  )
    return `A etapa de avaliação deve estar inteiramente dentro do período do ${labels[term]} da oferta.`;
  for (const other of state.events) {
    const match = /^stage-([1-4]):([a-z][a-z0-9-]*)$/.exec(other.requirementId ?? '');
    if (other.id === event.id || !match || match[2] !== offer.id) continue;
    const n = Number(match[1]);
    const total = offer.stages.perTerm * (offer.organization === 'semestral' ? 2 : 1);
    if (n > total || termFor(n) !== term) continue;
    if (n === ordinal) return 'Há etapas de avaliação duplicadas para a mesma oferta.';
    if ((n < ordinal && other.end >= event.start) || (n > ordinal && other.start <= event.end))
      return 'As etapas de avaliação da oferta devem ocorrer em sequência, sem sobreposição dentro de cada ciclo.';
  }
  return undefined;
}
export function projectCalendar(
  snapshot: Snapshot,
  calendar: SnapshotRow,
  content: SnapshotRow,
  campus: SnapshotRow,
  runtime: DomainRuntime,
): CalendarProjection {
  const raw = object(content.state, 'conteudo-sem-estado');
  const year = Number(calendar.year);
  let state: ObjectValue;
  if (runtime.mode === 'source-v3') {
    assertValue(
      raw.schemaVersion === undefined || [2, 3].includes(raw.schemaVersion),
      'origem-nao-v2-v3',
    );
    assertValue(Array.isArray(calendar.modalities), 'origem-sem-modalidades');
    state = runtime.conversion!.convertCalendarV2({
      ...cloneJson(raw),
      schemaVersion: raw.schemaVersion ?? 2,
      year,
      campus: campus.name,
      modalities: calendar.modalities,
      offer: calendar.modalities[0],
    });
  } else {
    assertValue(raw.schemaVersion === 4 && Array.isArray(raw.offers), 'destino-nao-v4');
    state = { ...cloneJson(raw), year, campus: campus.name };
  }
  const policy = runtime.policy.policyFor(year);
  const labels: Record<string, string> = {
    integrado: 'Técnico integrado',
    subsequente: 'Técnico subsequente',
    graduacao: 'Graduação',
    posgraduacao: 'Pós-graduação',
  };
  const offers: ObjectValue[] =
    runtime.mode === 'source-v3'
      ? (calendar.modalities as string[]).map((id: string) => ({
          id,
          kind: id,
          label: labels[id],
          organization: state.organizationByModality?.[id] ?? 'a-classificar',
          perTerm:
            state.organizationByModality?.[id] === 'semestral'
              ? state.assessmentStagesByModality?.[id] / 2
              : state.assessmentStagesByModality?.[id],
        }))
      : state.offers.map((offer: ObjectValue) => ({
          ...offer,
          label: offer.label || labels[offer.kind],
          perTerm: offer.stages?.perTerm,
        }));
  const requirements: ObjectValue[] = runtime.checklist.activityChecklist(state);
  const events = [...(content.institutionalSnapshot as ObjectValue[]), ...state.events];
  const currentCatalogue = catalogue(snapshot, year);
  const latestEvents = runtime.base.applicableEvents(currentCatalogue, state);
  const base = runtime.base.inspectCalendar(
    { ...content, state },
    {
      currentCatalogueRevision: currentCatalogue.revision,
      institutionalEvents: latestEvents,
      currentDocuments: documents(snapshot, year),
      currentRulesetVersion: runtime.policy.rulesetVersion(state),
    },
  );
  const excluded = (offer: ObjectValue) =>
    runtime.mode === 'source-v3'
      ? policy.excludedModalities.includes(offer.kind)
      : policy.excludes(offer);
  const apply = (requirement: ObjectValue, offer: ObjectValue) =>
    policy.applicability(state, requirement, runtime.mode === 'source-v3' ? offer.id : offer);
  /** Normalize only declared single-offer identities, retaining every unrelated field. */
  const scopedIdentity = (
    value: ObjectValue,
    required: boolean,
    canonicalField: 'modality' | 'offerId' = 'modality',
    expectedId?: string,
  ): ObjectValue => {
    const hasOffer = Object.hasOwn(value, 'offerId');
    const hasModality = Object.hasOwn(value, 'modality');
    if (!hasOffer && !hasModality) {
      assertValue(!required, 'identidade-de-escopo-ausente');
      return { ...value };
    }
    for (const field of ['offerId', 'modality'])
      if (Object.hasOwn(value, field))
        assertValue(
          typeof value[field] === 'string' && offers.some((offer) => offer.id === value[field]),
          'identidade-de-escopo-invalida',
        );
    if (hasOffer && hasModality)
      equal(value.offerId, value.modality, 'aliases-de-escopo-conflitantes');
    const id = hasOffer ? value.offerId : value.modality;
    if (expectedId !== undefined) equal(id, expectedId, 'identidade-de-escopo-divergente');
    const { offerId: _offerId, modality: _modality, ...fields } = value;
    return { ...fields, [canonicalField]: id };
  };
  // These are the normative 2027 cycle rows. Concrete offer IDs are derived from raw
  // organization/term, independently of the checklist producer and its applicability result.
  const validateCycleOfferIds = (requirement: ObjectValue) => {
    const match =
      /^(final|diary|recognition|final-appeal|admission-notice|enrolment|adjustment|withdrawal|registration)-([012])$/.exec(
        requirement.id,
      );
    const term = match ? ['annual', 'first', 'second'][Number(match[2])] : undefined;
    const normativeCycle =
      runtime.mode === 'current-v4' &&
      year === 2027 &&
      match &&
      requirement.term === term &&
      requirement.basis !== 'Classificação legada';
    if (!normativeCycle) {
      assertValue(!Object.hasOwn(requirement, 'offerIds'), 'escopo-extra-de-requisito');
      return;
    }
    const selected = offers.filter(
      (offer) =>
        offer.kind !== 'posgraduacao' &&
        offer.organization === (term === 'annual' ? 'anual' : 'semestral'),
    );
    assertValue(selected.length > 0, 'ciclo-de-requisito-sem-oferta');
    equal(
      requirement.offerIds,
      selected.map((offer) => offer.id),
      'escopo-de-ciclo-divergente',
    );
    equal(
      requirement.modalities,
      [...new Set(selected.map((offer) => offer.kind))],
      'tipos-de-ciclo-divergentes',
    );
  };
  const normalizeRequirement = (requirement: ObjectValue) => {
    validateCycleOfferIds(requirement);
    const { offerIds: _ids, ...fields } = scopedIdentity(
      requirement,
      /^(stage|results|council|pedagogical-meeting)-[1-4]:/.test(requirement.id),
    );
    return {
      ...fields,
      applicabilityByOffer: Object.fromEntries(
        offers.map((offer) => [offer.id, apply(requirement, offer)]),
      ),
    };
  };
  const pendingCodes: string[] = [];
  const pendingMessages: string[] = [];
  if (!state.weekConfirmed) {
    pendingCodes.push('week-unconfirmed');
    pendingMessages.push('Configuração não confirmada');
  }
  const scopedPeriods = offers.map((offer) => ({
    id: offer.id,
    periods: state.periods
      .filter(
        (period: ObjectValue) =>
          period.association?.status === 'defined' &&
          (period.association.offers ?? period.association.modalities ?? []).includes(offer.id),
      )
      .map(({ id, start, end }: ObjectValue) => ({ id, start, end })),
  }));
  for (const offer of offers) {
    if (offer.organization === 'a-classificar') {
      pendingCodes.push(`organization-unclassified:${offer.id}`);
      pendingMessages.push(
        'Organização a conferir: classifique os períodos por oferta antes de confirmar a contagem.',
      );
    }
    if (!scopedPeriods.find((item) => item.id === offer.id)!.periods.length) {
      pendingCodes.push(`periods-missing:${offer.id}`);
      pendingMessages.push('Informe períodos');
    }
  }
  const pending = {
    codes: pendingCodes.sort(),
    messages: pendingMessages,
    evidenceHash: fingerprint({
      weekdays: state.weekdays,
      weekConfirmed: state.weekConfirmed,
      organizations: offers.map((offer) => ({
        id: offer.id,
        organization: offer.organization,
      })),
      scopedPeriods,
    }),
  };
  const counting = calculate(() => {
    const result = runtime.evaluation.evaluateCalendar(state, events);
    return Object.fromEntries(
      Object.entries(result.byOffer ?? result.byModality).map(([id, value]) => {
        const { ledger, ...summary } = value as ObjectValue;
        const normalizedSummary = scopedIdentity(summary, true, 'offerId', id);
        // Installed v3/A/B ledgers, checks and conflicts carry no offer identity. If a
        // runtime adds one, compare it as data and validate its scope; never recursively strip.
        for (const list of [ledger, summary.checks, summary.conflicts])
          for (const entry of list)
            if (Object.hasOwn(entry, 'offerId') || Object.hasOwn(entry, 'modality'))
              scopedIdentity(entry, true, 'offerId', id);
        return [id, { ...normalizedSummary, ledgerSha256: fingerprint(ledger) }];
      }),
    );
  }, pending);
  const diagnostics = calculate(() => {
    const result = runtime.diagnostics.diagnoseCalendar(state, events);
    const teaching =
      counting.status === 'computed'
        ? runtime.diagnostics.diagnoseTeachingDays(
            state,
            runtime.evaluation.evaluateCalendar(state, events),
          )
        : null;
    return {
      structure: result.structure.map((value: ObjectValue) =>
        scopedIdentity(value, ['organization-unclassified', 'period-count'].includes(value.code)),
      ),
      teaching: teaching?.map((value: ObjectValue) => scopedIdentity(value, true)) ?? null,
      coverage: result.coverage.map(
        ({ requirement, events: linked, offer, ...value }: ObjectValue) => {
          const normalized = scopedIdentity(value, true);
          if (runtime.mode === 'current-v4')
            equal(
              offer,
              state.offers.find((item: ObjectValue) => item.id === normalized.modality),
              'oferta-redundante-de-cobertura-divergente',
            );
          else assertValue(offer === undefined, 'oferta-extra-de-cobertura');
          return {
            ...normalized,
            requirementId: requirement.id,
            eventIds: linked.map((event: ObjectValue) => event.id),
          };
        },
      ),
    };
  });
  const token = (message: string) => lexicalToken(message, requirements, offers);
  const sourceReviews = rows(snapshot, 'reviews').filter((row) => row.calendarId === calendar._id);
  assertValue(sourceReviews.length <= 1, 'pareceres-duplicados-do-calendario');
  // Readiness uses exactly these unchanged review fields; transport-only dates/URLs are irrelevant.
  const calculateReadiness = (reviews: SnapshotRow[]): ReadinessProjection => {
    const value = runtime.readiness.releaseReadiness(
      {
        id: calendar._id,
        version: calendar.version,
        catalogueRevision: content.catalogueRevision,
        institutionalSnapshot: content.institutionalSnapshot,
        state,
      },
      { catalogue: currentCatalogue, base, reviews },
    );
    return cloneJson({
      ...value,
      issues: value.issues.map(token).sort(),
      warnings: value.warnings.map(token).sort(),
    });
  };
  const realReadiness = calculateReadiness(sourceReviews);
  const readiness = runtime.mode === 'source-v3' ? calculateReadiness([]) : realReadiness;
  const reviewPurge: ReviewPurgeEvidence | undefined =
    runtime.mode === 'source-v3'
      ? cloneJson({
          reviews: sourceReviews,
          policy: {
            criteria: policy.review.criteria,
            evidence: policy.review.evidence,
            boundRuleset: policy.rulesetPrefix ? policy.rulesetVersion(state) : undefined,
            rulesetChanges: policy.rulesetChanges ?? [],
          },
          before: realReadiness,
          after: readiness,
          delta: readinessPurgeDelta(realReadiness, readiness),
        })
      : undefined;
  const cycleWarnings: string[] = [];
  if (runtime.mode === 'current-v4') {
    for (const offer of offers) {
      const count = offer.stages
        ? offer.stages.perTerm * (offer.organization === 'semestral' ? 2 : 1)
        : 0;
      for (let ordinal = 1; ordinal <= count; ordinal++) {
        const event = events.find(
          (item) =>
            item.requirementId === `stage-${ordinal}:${offer.id}` &&
            (!item.offers || item.offers.includes(offer.id)),
        );
        if (!event) continue;
        const issue = independentlyCheckStageCycle(state, offer, event, ordinal);
        if (issue)
          cycleWarnings.push(
            token(
              `${offer.label} — ${offer.organization === 'semestral' ? `${((ordinal - 1) % offer.stages.perTerm) + 1}ª etapa — ${Math.ceil(ordinal / offer.stages.perTerm)}º semestre` : `${ordinal}ª etapa`}: ${issue}`,
            ),
          );
      }
    }
  }
  return cloneJson({
    calendarId: calendar._id,
    contentId: content._id,
    ...(runtime.mode === 'source-v3' ? { normalizedSource: state } : {}),
    requirements: requirements.map(normalizeRequirement),
    minimums: Object.fromEntries(
      offers.map((offer) => {
        const minimum =
          runtime.mode === 'source-v3'
            ? runtime.policy.countingMinimums(state, offer.id)
            : policy.countingMinimums(state, offer);
        return [
          offer.id,
          {
            annual:
              typeof minimum.annual === 'number' ? minimum.annual : (minimum.annual?.days ?? null),
            semester:
              typeof minimum.semester === 'number'
                ? minimum.semester
                : (minimum.semester?.days ?? null),
          },
        ];
      }),
    ),
    counting,
    diagnostics,
    base: {
      identity: base.identity,
      compatible: base.compatible,
      kind: base.kind,
    },
    window: policy.window(state),
    readiness,
    ...(reviewPurge ? { reviewPurge } : {}),
    scope: {
      issue: policy.scope?.readinessIssue,
      excludedIds: offers.filter(excluded).map((offer) => offer.id),
      pendingIncludedIds: offers
        .filter(
          (offer) =>
            !excluded(offer) &&
            (runtime.mode === 'source-v3'
              ? state.scopeConfirmation?.status
              : offer.scope?.status) !== 'covered',
        )
        .map((offer) => offer.id),
    },
    cycleWarnings: cycleWarnings.sort(),
  });
}
export function projectSnapshot(snapshot: Snapshot, runtime: DomainRuntime): DomainProjection {
  const calendars = indexRows(rows(snapshot, 'calendars'), 'calendars');
  const campuses = indexRows(rows(snapshot, 'campuses'), 'campuses');
  const contents = rows(snapshot, 'calendarContents');
  indexRows(contents, 'calendarContents');
  const inventory: DomainProjection['inventory'] = {
    v2: 0,
    contentsWithoutCalendar: 0,
    calendarsWithoutContent: 0,
    orphanMapKeys: 0,
    withoutStages: 0,
    unclassifiedOffersWithKnownStageCount: 0,
    semesterWithThreeStages: 0,
    yearThrough2026: 0,
    legacyIntakeDecisions: 0,
    nonEventRecords: 0,
    legacyRequirementIds: {},
  };
  const projected: DomainProjection['calendars'] = {};
  for (const calendar of calendars.values()) {
    if (Number(calendar.year) <= 2026) inventory.yearThrough2026++;
    if (!contents.some((content) => content.calendarId === calendar._id))
      inventory.calendarsWithoutContent++;
  }
  for (const content of contents) {
    const calendar = calendars.get(String(content.calendarId));
    if (!calendar) {
      inventory.contentsWithoutCalendar++;
      continue;
    }
    assertValue(!projected[calendar._id], 'conteudos-duplicados-do-calendario');
    const campus = campuses.get(String(calendar.campusId));
    assertValue(campus, 'calendario-sem-campus');
    const raw = object(content.state, 'estado-invalido');
    if (runtime.mode === 'source-v3') {
      if (raw.schemaVersion === undefined || raw.schemaVersion === 2) inventory.v2++;
      for (const name of [
        'organizationByModality',
        'intakeByModality',
        'assessmentStagesByModality',
      ])
        inventory.orphanMapKeys += Object.keys(raw[name] ?? {}).filter(
          (id) => !(calendar.modalities as string[]).includes(id),
        ).length;
    }
    const projection = projectCalendar(snapshot, calendar, content, campus, runtime);
    projected[calendar._id] = projection;
    const state = projection.normalizedSource ?? raw;
    const offerValues =
      runtime.mode === 'source-v3'
        ? (calendar.modalities as string[]).map((id: string) => ({
            organization: state.organizationByModality?.[id] ?? 'a-classificar',
            count: state.assessmentStagesByModality?.[id],
          }))
        : raw.offers.map((offer: ObjectValue) => ({
            organization: offer.organization,
            count: offer.stages?.perTerm ?? offer.legacyStageCount,
          }));
    if (offerValues.some((offer: ObjectValue) => offer.count === undefined))
      inventory.withoutStages++;
    inventory.unclassifiedOffersWithKnownStageCount += offerValues.filter(
      (offer: ObjectValue) =>
        offer.organization === 'a-classificar' && [2, 3, 4].includes(offer.count),
    ).length;
    inventory.semesterWithThreeStages += offerValues.filter(
      (offer: ObjectValue) => offer.organization === 'semestral' && offer.count === 3,
    ).length;
    if (raw.legacySecondSemesterIntake !== undefined) inventory.legacyIntakeDecisions++;
    for (const event of state.events) {
      if (event.recordType && event.recordType !== 'event') inventory.nonEventRecords++;
      const policy = runtime.policy.policyFor(Number(calendar.year));
      const declared = policy
        .requirements(state)
        .some(
          (requirement: ObjectValue) =>
            requirement.id === event.requirementId &&
            requirement.reason ===
              'Vínculo legado conservado; confira o requisito e a organização aplicáveis em 2027.',
        );
      if (declared && event.requirementId)
        inventory.legacyRequirementIds[event.requirementId] =
          (inventory.legacyRequirementIds[event.requirementId] ?? 0) + 1;
    }
  }
  return {
    format: 1,
    snapshotSha256: snapshot.sha256,
    mode: runtime.mode,
    calendars: projected,
    inventory,
  };
}
