/**
 * Compares two contents of the same calendar chain, normalizing both sides before matching, so
 * that derived data never shows up as a campus change. Pure: the browser computes it from cached
 * submission copies and the content already open in the editor.
 */
import { equalValues } from '../../shared/equal.ts';
import type { CivilDate } from '../civil-date.ts';
import type {
  ActivityState,
  CalendarEvent,
  InstitutionalEventSnapshot,
  CalendarOffer,
  CalendarPeriod,
  DateFields,
  EventScope,
} from './model.ts';
import { evaluateCalendar } from './counting/evaluation.ts';
import { projectDates } from './model.ts';
import { observanceForEvent, observanceRules } from './observances.ts';
import { labelFor } from './offers.ts';
import { contentIssues, type ContentIssue } from './readiness.ts';
import { termLabels, type AcademicTerm } from './config.ts';
import { activityKey, type ActivityRef } from './activities/activity-ref.ts';
import { generatedActivities, generatedActivity } from './activities/links.ts';

export interface DiffSide {
  state: ActivityState & {
    rulesetVersion?: string;
    teacherVacations?: Partial<Record<VacationField, CivilDate>>;
  };
  institutionalSnapshot: (InstitutionalEventSnapshot & Record<string, unknown>)[];
  documentSnapshot: ({ id: string } & Record<string, unknown>)[];
  catalogueRevision: number;
}

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}
export interface ItemChange {
  kind: 'added' | 'removed' | 'changed' | 'reidentified';
  id: string;
  previousId?: string;
  name: string;
  fields: FieldChange[];
  note?: string;
}

type VacationField =
  'firstStart' | 'firstEnd' | 'secondStart' | 'secondEnd' | 'thirdStart' | 'thirdEnd';

/**
 * Every field of the stored validators has a label here or is listed as ignored. A dotted key
 * (`notice.publication`) labels one part of a grouped field, compared on its own.
 */
export const fieldLabels = {
  offer: {
    kind: 'Tipo de oferta',
    label: 'Nome da oferta',
    delivery: 'Modo de oferta',
    organization: 'Organização',
    stages: 'Etapas de avaliação',
    scope: 'Escopo da norma',
    intake: 'Ingresso de estudantes',
    organizationBasis: 'Fundamento da organização',
  },
  period: {
    name: 'Nome',
    start: 'Início',
    end: 'Término',
    targetDays: 'Meta de dias letivos',
    association: 'Associação a ofertas',
  },
  event: {
    name: 'Nome',
    start: 'Início',
    end: 'Término',
    effect: 'Efeito na contagem',
    category: 'Categoria',
    activity: 'Atividade vinculada',
    'scope.offers': 'Ofertas',
    'scope.confirmed': 'Abrangência confirmada',
    hours: 'Carga horária',
    assessmentAutoStart: 'Início automático da etapa',
    'notice.publication': 'Situação de publicação',
    'notice.admission': 'Ingresso e destinos por oferta',
    deadlineAdjustment: 'Ajuste de prazo',
    deadlineExtensionCause: 'Causa da prorrogação',
  },
  week: { weekdays: 'Dias da semana letiva', weekConfirmed: 'Semana letiva confirmada' },
  vacations: {
    firstStart: 'Início das primeiras férias',
    firstEnd: 'Término das primeiras férias',
    secondStart: 'Início das segundas férias',
    secondEnd: 'Término das segundas férias',
    thirdStart: 'Início das terceiras férias',
    thirdEnd: 'Término das terceiras férias',
  } satisfies Record<VacationField, string>,
  base: { rulesetVersion: 'Conjunto de regras', catalogueRevision: 'Revisão da base' },
  institutionalEvent: {
    name: 'Nome',
    start: 'Início',
    end: 'Término',
    effect: 'Efeito na contagem',
    evidence: 'Evidência',
    category: 'Categoria',
    modalities: 'Formas de oferta',
    offers: 'Ofertas',
    hours: 'Carga horária',
    assessmentAutoStart: 'Início automático da etapa',
    'notice.publication': 'Situação de publicação',
    'notice.admission': 'Ingresso e destinos por oferta',
    deadlineAdjustment: 'Ajuste de prazo',
    deadlineExtensionCause: 'Causa da prorrogação',
    active: 'Ativo',
    source: 'Fonte',
    originalStart: 'Início na base',
    originalEnd: 'Término na base',
  },
  document: {
    year: 'Ano',
    type: 'Tipo',
    title: 'Título',
    source: 'Fonte',
    hash: 'Conteúdo do arquivo',
    filename: 'Nome do arquivo',
    status: 'Situação',
    version: 'Versão',
  },
} as const;

/** Identity, storage and bookkeeping fields: compared through their sections or not at all. */
export const ignoredFields = {
  offer: ['id'],
  period: ['id'],
  event: ['id'],
  state: [
    'schemaVersion',
    'offers',
    'periods',
    'events',
    'observanceDates',
    'teacherVacations',
    'rulesetVersion',
    'weekdays',
    'weekConfirmed',
  ],
  institutionalEvent: ['id', 'institutional'],
  document: [
    'id',
    'storageId',
    'unavailableFile',
    'size',
    'createdAt',
    'createdBy',
    'publishedAt',
    'publishedBy',
    'archivedAt',
  ],
} as const;

const derivedVacation = (event: { id: string }) => event.id.startsWith('teacher-vacation-');
const sortedIds = (ids: readonly string[]) => [...ids].sort();

/**
 * Offers and destinations by offer are compared in identifier order, so only a change of the set
 * or of a period shows up. Local dates always list their offers (`scope`); a snapshot entry keeps
 * the offers it was copied with.
 */
function comparable<
  T extends Pick<DateFields, 'notice'> & { scope?: EventScope; offers?: string[] },
>(item: T): T {
  const admission = item.notice?.admission;
  return {
    ...item,
    ...(item.scope && { scope: { ...item.scope, offers: sortedIds(item.scope.offers) } }),
    ...(item.offers && { offers: sortedIds(item.offers) }),
    ...(admission && {
      notice: {
        ...item.notice,
        admission: {
          ...admission,
          destinations: [...admission.destinations].sort((a, b) =>
            a.offerId.localeCompare(b.offerId),
          ),
        },
      },
    }),
  };
}

/** Value of a field, or of one part of a grouped field (`notice.admission`). */
function fieldValue(item: Record<string, unknown>, field: string) {
  return field
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      item,
    );
}

function fieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
) {
  const changes: FieldChange[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const old = fieldValue(before, field),
      next = fieldValue(after, field);
    if (!equalValues(old ?? null, next ?? null))
      changes.push({ field, label, before: old, after: next });
  }
  return changes;
}

function compareItems<T extends { id: string; name?: string }>(
  before: T[],
  after: T[],
  labels: Record<string, string>,
  pairKey?: (item: T) => string | undefined,
): ItemChange[] {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  const changes: ItemChange[] = [];
  const name = (item: T) => item.name || item.id;
  for (const item of after) {
    const previous = old.get(item.id);
    if (!previous) continue;
    const fields = fieldChanges(previous, item, labels);
    if (fields.length) changes.push({ kind: 'changed', id: item.id, name: name(item), fields });
  }
  const added = after.filter((item) => !old.has(item.id));
  const removed = before.filter((item) => !next.has(item.id));
  // Splitting shared records or recreating an event issues new identifiers for the same item.
  if (pairKey)
    for (const item of [...added]) {
      const key = pairKey(item);
      if (key === undefined) continue;
      const index = removed.findIndex((candidate) => pairKey(candidate) === key);
      if (index < 0) continue;
      const [previous] = removed.splice(index, 1);
      added.splice(added.indexOf(item), 1);
      changes.push({
        kind: 'reidentified',
        id: item.id,
        previousId: previous.id,
        name: name(item),
        fields: fieldChanges(previous, item, labels),
      });
    }
  for (const item of added)
    changes.push({ kind: 'added', id: item.id, name: name(item), fields: [] });
  for (const item of removed)
    changes.push({ kind: 'removed', id: item.id, name: name(item), fields: [] });
  return changes;
}

export interface TeachingDayEffect {
  offerId: string;
  label: string;
  term: AcademicTerm | 'a-classificar';
  termLabel: string;
  before: number | null;
  after: number | null;
}

/** Teaching days by offer and term. A period split changes identifiers, never the term. */
function teachingDays(side: DiffSide) {
  const { state } = side;
  if (!state.weekConfirmed || !state.periods.length) return null;
  try {
    const result = evaluateCalendar(state, projectDates(side.institutionalSnapshot, state.events));
    const days = new Map<string, number>();
    for (const [offerId, count] of Object.entries(result.byOffer))
      for (const [periodId, total] of Object.entries(count.byPeriod)) {
        const period = state.periods.find((item) => item.id === periodId);
        const term =
          period?.association.status === 'defined' ? period.association.term : 'a-classificar';
        const key = `${offerId}|${term}`;
        days.set(key, (days.get(key) ?? 0) + total);
      }
    return days;
  } catch {
    return null;
  }
}

function matchIssues(before: ContentIssue[] | null, after: ContentIssue[] | null) {
  if (!before || !after) return { added: [], resolved: [] };
  const old = new Set(before.map((issue) => issue.code));
  const next = new Set(after.map((issue) => issue.code));
  return {
    added: after.filter((issue) => !old.has(issue.code)),
    resolved: before.filter((issue) => !next.has(issue.code)),
  };
}

function safeIssues(side: DiffSide) {
  try {
    return contentIssues(side.state, side.institutionalSnapshot);
  } catch {
    return null;
  }
}

/** Evaluated by the current rules on both sides, so the comparison stays coherent. */
function effect(before: DiffSide, after: DiffSide) {
  const old = teachingDays(before),
    next = teachingDays(after);
  const keys = new Set([...(old?.keys() ?? []), ...(next?.keys() ?? [])]);
  const rows: TeachingDayEffect[] = [...keys].sort().map((key) => {
    const [offerId, term] = key.split('|') as [string, AcademicTerm | 'a-classificar'];
    const owner = after.state.offers.some((offer) => offer.id === offerId) ? after : before;
    return {
      offerId,
      label: labelFor(owner.state, offerId),
      term,
      termLabel: term === 'a-classificar' ? 'Período a classificar' : termLabels[term],
      before: old ? (old.get(key) ?? null) : null,
      after: next ? (next.get(key) ?? null) : null,
    };
  });
  const beforeIssues = safeIssues(before),
    afterIssues = safeIssues(after);
  return {
    rules: 'current' as const,
    rulesetDiffers: (before.state.rulesetVersion ?? '') !== (after.state.rulesetVersion ?? ''),
    teachingDays: rows,
    unavailable: { before: !old, after: !next },
    issues: matchIssues(beforeIssues, afterIssues),
    issuesUnavailable: { before: !beforeIssues, after: !afterIssues },
  };
}

export type CalendarDiff = ReturnType<typeof compareContents>;

export function compareContents(before: DiffSide, after: DiffSide) {
  const beforeOffers = before.state.offers.map((offer) => offer.id);
  const afterOffers = after.state.offers.map((offer) => offer.id);
  const addedOffers = afterOffers.filter((id) => !beforeOffers.includes(id));
  const removedOffers = beforeOffers.filter((id) => !afterOffers.includes(id));
  const offerName = (side: DiffSide) => (offer: CalendarOffer) => ({
    ...offer,
    name: labelFor(side.state, offer.id),
  });
  const offers = compareItems(
    before.state.offers.map(offerName(before)),
    after.state.offers.map(offerName(after)),
    fieldLabels.offer,
  );

  const week = fieldChanges(
    { ...before.state, weekdays: sortedNumbers(before.state.weekdays) },
    { ...after.state, weekdays: sortedNumbers(after.state.weekdays) },
    fieldLabels.week,
  );

  const periodKey = (period: CalendarPeriod) =>
    period.association.status === 'defined'
      ? `${sortedIds(period.association.offers).join(',')}|${period.association.term}`
      : undefined;
  const periodSide = (side: DiffSide) =>
    side.state.periods.map((period) =>
      period.association.status === 'defined'
        ? {
            ...period,
            association: { ...period.association, offers: sortedIds(period.association.offers) },
          }
        : period,
    );
  const recalculatedByBase = before.catalogueRevision !== after.catalogueRevision;
  const periods = compareItems(
    periodSide(before),
    periodSide(after),
    fieldLabels.period,
    periodKey,
  ).map((change) => {
    const period = after.state.periods.find((item) => item.id === change.id);
    return recalculatedByBase &&
      period?.targetDays !== undefined &&
      change.fields.some((field) => field.field === 'end')
      ? { ...change, note: 'Possivelmente recalculado pela base.' }
      : change;
  });

  const eventSide = (side: DiffSide) =>
    side.state.events.filter((event) => !derivedVacation(event)).map(comparable);
  const eventKey = (event: CalendarEvent) =>
    event.activity ? `${activityKey(event.activity)}|${event.scope.offers.join(',')}` : undefined;
  const events = compareItems(eventSide(before), eventSide(after), fieldLabels.event, eventKey);

  const year = after.state.year;
  const observanceLabel = (key: string) =>
    observanceRules(year).find((rule) => rule.key === key)?.label ?? key;
  const beforeDates = before.state.observanceDates ?? {},
    afterDates = after.state.observanceDates ?? {};
  const observances: FieldChange[] = [
    ...new Set([...Object.keys(beforeDates), ...Object.keys(afterDates)]),
  ]
    .sort()
    .filter((key) => beforeDates[key] !== afterDates[key])
    .map((key) => ({
      field: key,
      label: observanceLabel(key),
      before: beforeDates[key],
      after: afterDates[key],
    }));

  const vacations = fieldChanges(
    before.state.teacherVacations ?? {},
    after.state.teacherVacations ?? {},
    fieldLabels.vacations,
  );

  // Institutional events belong to the campus when an observance or an offer inclusion explains
  // them, and to the base otherwise.
  const changedObservances = new Set(observances.map((change) => change.field));
  const institutional = compareItems(
    before.institutionalSnapshot.map(comparable),
    after.institutionalSnapshot.map(comparable),
    fieldLabels.institutionalEvent,
  ).flatMap((change) => {
    if (change.kind !== 'changed') return [change];
    const rule = observanceForEvent(year, change.id);
    const fields = change.fields.filter((field) => {
      if (
        rule &&
        changedObservances.has(rule.key) &&
        (field.field === 'start' || field.field === 'end')
      )
        return false;
      if (field.field === 'offers') {
        const old = (field.before as string[] | undefined) ?? [],
          next = (field.after as string[] | undefined) ?? [];
        const explained =
          next.filter((id) => !old.includes(id)).every((id) => addedOffers.includes(id)) &&
          old.filter((id) => !next.includes(id)).every((id) => removedOffers.includes(id));
        return !explained;
      }
      return true;
    });
    return fields.length ? [{ ...change, fields }] : [];
  });

  const documentName = (document: DiffSide['documentSnapshot'][number]) => ({
    ...document,
    name: typeof document.title === 'string' ? document.title : document.id,
  });
  const base = {
    fields: fieldChanges(
      { rulesetVersion: before.state.rulesetVersion, catalogueRevision: before.catalogueRevision },
      { rulesetVersion: after.state.rulesetVersion, catalogueRevision: after.catalogueRevision },
      fieldLabels.base,
    ),
    events: institutional,
    documents: compareItems(
      before.documentSnapshot.map(documentName),
      after.documentSnapshot.map(documentName),
      fieldLabels.document,
    ),
  };
  const campusChanges =
    offers.length +
    week.length +
    periods.length +
    events.length +
    observances.length +
    vacations.length;
  const baseChanges = base.events.length + base.documents.length + base.fields.length;
  return {
    offers,
    week,
    periods,
    events,
    observances,
    vacations,
    base,
    effect: effect(before, after),
    campusChanges,
    baseChanges,
    unchanged: campusChanges + baseChanges === 0,
  };
}

function sortedNumbers(values: readonly number[]) {
  return [...values].sort((a, b) => a - b);
}

const weekdayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Human reading of a compared value; offer identifiers resolve to their labels. */
const admissionTypes: Record<string, string> = {
  regular: 'Processo seletivo regular',
  transfer: 'Transferência, reingresso e portador de diploma',
};

function admissionDescription(admission: Record<string, unknown>, state?: ActivityState) {
  const destinations = (admission.destinations ?? []) as { offerId: string; periodId: string }[];
  const period = (id: string) => state?.periods.find((item) => item.id === id)?.name ?? id;
  return [
    admissionTypes[String(admission.type)] ?? String(admission.type),
    `${String(admission.year)} — ${termLabels[admission.term as AcademicTerm] ?? String(admission.term)}`,
    destinations.length
      ? `destinos: ${destinations
          .map(
            (item) =>
              `${state ? labelFor(state, item.offerId) : item.offerId} → ${period(item.periodId)}`,
          )
          .join(', ')}`
      : 'destino não informado',
  ].join(' · ');
}

export function describeValue(field: string, value: unknown, state?: ActivityState): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'notice.publication' && (value === 'planned' || value === 'published'))
    return value === 'planned' ? 'Publicação programada' : 'Publicação realizada';
  if (field === 'scope.confirmed' && typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split('-').reverse().join('/');
  if (field === 'weekdays' && Array.isArray(value))
    return value.map((day) => weekdayNames[Number(day)] ?? String(day)).join(', ');
  if ((field === 'offers' || field === 'scope.offers') && Array.isArray(value))
    return value.map((id) => (state ? labelFor(state, String(id)) : String(id))).join(', ');
  if (Array.isArray(value)) return value.map((item) => describeValue('', item, state)).join(', ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (field === 'notice.admission') return admissionDescription(record, state);
    if (field === 'activity') {
      const activity = record as unknown as ActivityRef;
      return (
        (state && generatedActivity(generatedActivities(state), activity)?.name) ??
        activityKey(activity)
      );
    }
    if (field === 'stages' && record.status === 'reported')
      return `${String(record.count)} etapas informadas; ciclos a conferir`;
    if (field === 'stages' && record.status === 'defined')
      return `${String(record.perTerm)} por ciclo`;
    if (field === 'association')
      return record.status === 'defined'
        ? `${describeValue('offers', record.offers, state)} · ${termLabels[record.term as AcademicTerm] ?? String(record.term)}`
        : 'a classificar';
    return Object.entries(record)
      .map(([key, item]) => `${key}: ${describeValue(key, item, state)}`)
      .join('; ');
  }
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '—';
}
