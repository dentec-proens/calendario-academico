import { equalValues } from '../../../shared/equal.ts';
import { DomainError } from '../../errors.ts';
import { policyFor } from '../../policies/registry.ts';
import { isStageActivity } from '../activities/activity-ref.ts';
import { coversAllOffers, generatedActivities, generatedActivity } from '../activities/links.ts';
import { calendarLimits } from '../config.ts';
import { datesBetween } from '../counting/core.ts';
import type { ActivityState, CalendarEvent, EventEffect, VacationPeriods } from '../model.ts';
import { labelFor, offerFor } from '../offers.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { createCampusDate, planActivityDate, type DateInput } from './events.ts';
import { applyVacations, vacationIds } from './vacations.ts';

/** How a date of another calendar reaches this one: the person decides, the group only suggests. */
export type CopyGroup = 'shared' | 'partial' | 'activity' | 'blocked';

export interface CopyCandidate {
  id: string;
  group: CopyGroup;
  /** Whether the list starts with the date marked. */
  suggested: boolean;
  name: string;
  periods: { start: string; end: string }[];
  effect: EventEffect;
  category?: string;
  /** Offers the date reaches in its calendar, when not all of them. */
  sourceOffers?: string[];
  /** Activity the date would count for, as this calendar generates it. */
  activity?: { name: string; optional: boolean };
  /** What the person should check before copying. */
  warning?: string;
  /** Why the date cannot be copied now. */
  blockedBy?: string;
  /** The block ends when the offers have their periods. */
  needsPeriods?: boolean;
}

export interface CopyList {
  candidates: CopyCandidate[];
  /** Dates of the other calendar that this one already has. */
  alreadyPresent: number;
  /** Dates tied to a stage position of an offer: never copied. */
  omitted: number;
}

type CopyState = ActivityState & { teacherVacations?: VacationPeriods };

/** Teacher vacations are one choice, as in `applyVacations`, whatever the number of periods. */
export const copiedVacationsId = 'teacher-vacations';

/** The offers and admission destinations of the other calendar mean nothing here. */
function copiedDate<S extends CopyState>(
  event: CalendarEvent,
  offers: readonly string[],
  id: string,
): DateInput<S> {
  const { activity: _activity, assessmentAutoStart: _auto, ...rest } = event;
  const admission = rest.notice?.admission;
  return {
    ...rest,
    id,
    offers: [...offers],
    ...(admission
      ? { notice: { ...rest.notice, admission: { ...admission, destinations: [] } } }
      : {}),
  } as DateInput<S>;
}

function place<S extends CopyState>(
  state: S,
  event: CalendarEvent,
  offers: readonly string[],
  id: string,
): S {
  const date = copiedDate<S>(event, offers, id);
  return event.activity
    ? planActivityDate(state, event.activity, date)
    : createCampusDate(state, date);
}

function refusal(command: () => unknown) {
  try {
    command();
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.message;
    throw error;
  }
}

function vacationsCandidate(target: CopyState, values: VacationPeriods): CopyCandidate {
  const periods = (
    [
      [values.firstStart, values.firstEnd],
      [values.secondStart, values.secondEnd],
      [values.thirdStart, values.thirdEnd],
    ] as const
  ).flatMap(([start, end]) => (start && end ? [{ start, end }] : []));
  const blockedBy = refusal(() => applyVacations(target, values));
  return {
    id: copiedVacationsId,
    group: blockedBy ? 'blocked' : 'shared',
    // Marked only when nothing is lost: copying replaces the vacations of this calendar.
    suggested: !blockedBy && !target.teacherVacations,
    name: 'Férias docentes',
    periods,
    effect: 'exclude',
    category: 'ferias',
    ...(target.teacherVacations
      ? { warning: 'Substitui as férias já cadastradas neste calendário.' }
      : {}),
    ...(blockedBy ? { blockedBy } : {}),
  };
}

const outsidePeriods = (state: CopyState, event: CalendarEvent, offers: readonly string[]) =>
  event.effect === 'include' &&
  datesBetween(event.start, event.end).some((date) =>
    offers.some(
      (offer) =>
        !periodsForOffer(state, offer).some((period) => period.start <= date && period.end >= date),
    ),
  );

function dateWarning(event: CalendarEvent) {
  if (event.notice?.publication === 'published')
    return 'Marcada como publicada na origem. Confira se vale para este calendário.';
  if (event.notice)
    return 'É uma publicação de edital na origem. Confira se vale para este calendário.';
  if (event.deadlineAdjustment)
    return 'Tem prazo ajustado na origem. Confira se vale para este calendário.';
  return undefined;
}

/** Never an ID of this calendar: a new version keeps the IDs of the calendar it came from. */
const probeId = 'copy-probe';

function dateCandidate(
  target: CopyState,
  source: CopyState,
  event: CalendarEvent,
  offers: readonly string[],
  generated: ReturnType<typeof generatedActivities>,
): CopyCandidate {
  const row = generatedActivity(generated, event.activity);
  const needsPeriods = outsidePeriods(target, event, offers);
  const blockedBy =
    event.activity && !row
      ? 'Este calendário não gera esta atividade.'
      : needsPeriods
        ? 'Fora dos períodos letivos deste calendário.'
        : refusal(() => place(target, event, offers, probeId));
  const warning =
    dateWarning(event) ??
    (row && !coversAllOffers(target, row, { offers })
      ? 'A atividade não abrange todas as ofertas escolhidas, e a data valerá para todas elas.'
      : undefined);
  const partial = event.offers.length < source.offers.length;
  const group: CopyGroup = blockedBy
    ? 'blocked'
    : event.activity || warning
      ? 'activity'
      : partial
        ? 'partial'
        : 'shared';
  const policy = policyFor(target.year);
  return {
    id: event.id,
    group,
    suggested: group === 'shared',
    name: event.name,
    periods: [{ start: event.start, end: event.end }],
    effect: event.effect,
    ...(event.category ? { category: event.category } : {}),
    ...(partial ? { sourceOffers: event.offers.map((offer) => labelFor(source, offer)) } : {}),
    ...(row
      ? {
          activity: {
            name: row.name,
            optional: offers.every((id) => {
              const offer = offerFor(target, id);
              return !offer || policy.applicability(target, row, offer) !== 'required';
            }),
          },
        }
      : {}),
    ...(warning ? { warning } : {}),
    ...(blockedBy ? { blockedBy } : {}),
    ...(needsPeriods ? { needsPeriods } : {}),
  };
}

const sameName = (a: CalendarEvent, b: CalendarEvent) =>
  a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase();

/** This calendar has the date for every offer chosen: copying would add nothing. */
const covered = (event: CalendarEvent, other: CalendarEvent, offers: readonly string[]) =>
  sameName(event, other) &&
  event.start === other.start &&
  event.end === other.end &&
  event.effect === other.effect &&
  offers.every((offer) => other.offers.includes(offer));

/**
 * One date per occurrence. Separate records for different offers become the same date here, where
 * they all reach the offers chosen, so they are one choice, with the offers they reach together.
 */
function distinctDates(events: readonly CalendarEvent[]) {
  const dates = new Map<string, CalendarEvent>();
  for (const event of events) {
    const admission = event.notice?.admission;
    const key = JSON.stringify([
      event.name.trim().toLocaleLowerCase(),
      event.start,
      event.end,
      admission && [admission.type, admission.year, admission.term],
    ]);
    const known = dates.get(key);
    dates.set(
      key,
      known ? { ...known, offers: [...new Set([...known.offers, ...event.offers])] } : event,
    );
  }
  return [...dates.values()];
}

/**
 * What another calendar offers to this one. Dates tied to a stage (assessments, results, councils
 * and meetings) stay out: their position belongs to the offer. Nothing is decided for the person beyond the initial marks: a date reaching every offer of
 * its calendar is probably of the whole campus, while a linked date would count as fulfilment here.
 */
export function copyList(
  target: CopyState,
  source: CopyState,
  offers: readonly string[],
): CopyList {
  if (source.year !== target.year)
    throw new DomainError('Só é possível copiar datas de um calendário do mesmo ano.');
  const generated = generatedActivities(target);
  const candidates: CopyCandidate[] = [];
  let alreadyPresent = 0;
  let omitted = 0;
  if (source.teacherVacations) {
    if (equalValues(source.teacherVacations, target.teacherVacations)) alreadyPresent++;
    else candidates.push(vacationsCandidate(target, source.teacherVacations));
  }
  for (const event of distinctDates(source.events)) {
    if (vacationIds.has(event.id)) continue;
    if (isStageActivity(event.activity)) omitted++;
    else if (target.events.some((other) => covered(event, other, offers))) alreadyPresent++;
    else candidates.push(dateCandidate(target, source, event, offers, generated));
  }
  candidates.sort(
    (a, b) =>
      a.periods[0].start.localeCompare(b.periods[0].start) || a.name.localeCompare(b.name, 'pt-BR'),
  );
  return { candidates, alreadyPresent, omitted };
}

/**
 * Copies the chosen dates, all or none, as dates of this calendar: from here on the two calendars
 * are independent. Each date passes the checks of a date filled in by hand.
 */
export function applyCopiedDates<S extends CopyState>(
  target: S,
  source: CopyState,
  chosen: readonly string[],
  offers: readonly string[],
  id: () => string,
): S {
  if (source.year !== target.year)
    throw new DomainError('Só é possível copiar datas de um calendário do mesmo ano.');
  let next = target;
  if (chosen.includes(copiedVacationsId) && source.teacherVacations)
    next = applyVacations(next, source.teacherVacations);
  for (const event of source.events) {
    if (!chosen.includes(event.id) || vacationIds.has(event.id)) continue;
    if (isStageActivity(event.activity)) continue;
    try {
      next = place(next, event, offers, id());
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      throw new DomainError(`${event.name}: ${error.message}`);
    }
  }
  if (next.events.length > calendarLimits.maximumEvents)
    throw new DomainError(
      `O calendário pode ter até ${calendarLimits.maximumEvents} datas. Marque menos datas.`,
    );
  return next;
}
