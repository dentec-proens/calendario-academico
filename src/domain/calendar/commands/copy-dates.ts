import { equalValues } from '../../../shared/equal.ts';
import { DomainError } from '../../errors.ts';
import { policyFor } from '../../policies/registry.ts';
import { isStageActivity, sameActivity } from '../activities/activity-ref.ts';
import { isSaturdayRecord } from '../activities/saturdays.ts';
import { coversAllOffers, generatedActivities, generatedActivity } from '../activities/links.ts';
import { calendarLimits } from '../config.ts';
import { datesBetween } from '../counting/core.ts';
import { vacationDates, vacationKind } from '../activities/vacations.ts';
import type { ActivityState, CalendarEvent, EventEffect } from '../model.ts';
import { labelFor, offerFor, offerNames } from '../offers.ts';
import { hasPeriodOn, periodsForOffer } from '../organization/periods.ts';
import { createCampusDate, planActivityDate, type DateInput } from './events.ts';
import { replaceTeacherVacations } from './vacations.ts';

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

type CopyState = ActivityState;

/** Teacher vacations are one choice, as in `replaceTeacherVacations`, whatever the number of periods. */
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

const periodOf = ({ start, end }: Pick<CalendarEvent, 'start' | 'end'>) => ({ start, end });
const teacherPeriods = (state: CopyState) => vacationDates(state.events, 'teacher').map(periodOf);

function vacationsCandidate(target: CopyState, source: CopyState): CopyCandidate {
  const periods = teacherPeriods(source);
  const blockedBy = refusal(() => replaceTeacherVacations(target, periods, probeIds()));
  const replaces = teacherPeriods(target).length > 0;
  return {
    id: copiedVacationsId,
    group: blockedBy ? 'blocked' : 'shared',
    // Marked only when nothing is lost: copying replaces the vacations of this calendar.
    suggested: !blockedBy && !replaces,
    name: 'Férias docentes',
    periods,
    effect: 'exclude',
    category: 'ferias',
    ...(replaces ? { warning: 'Substitui as férias já cadastradas neste calendário.' } : {}),
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

/**
 * The offers chosen that a copied date can list. A Saturday reaches each offer on its own, as in
 * the Saturdays step, so it goes only to those with a period on that day; other dates stay whole.
 */
const reachedOffers = (state: CopyState, event: CalendarEvent, offers: readonly string[]) =>
  event.effect === 'include' && isSaturdayRecord(event)
    ? offers.filter((offer) => hasPeriodOn(state, offer, event.start))
    : offers;

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
function probeIds() {
  let index = 0;
  return () => `${probeId}-${index++}`;
}

function dateCandidate(
  target: CopyState,
  source: CopyState,
  event: CalendarEvent,
  offers: readonly string[],
  generated: ReturnType<typeof generatedActivities>,
): CopyCandidate {
  const row = generatedActivity(generated, event.activity);
  const reached = reachedOffers(target, event, offers);
  const leftOut = offers.filter((offer) => !reached.includes(offer));
  const needsPeriods = !reached.length || outsidePeriods(target, event, reached);
  // Same occurrence for the commands, whatever the link: the person decides which one stays.
  const otherLink = target.events.some(
    (other) =>
      other.name.trim().toLocaleLowerCase() === event.name.trim().toLocaleLowerCase() &&
      other.start === event.start &&
      other.end === event.end &&
      other.offers.some((offer) => reached.includes(offer)) &&
      !sameActivity(other.activity, event.activity),
  );
  const blockedBy =
    event.activity && !row
      ? 'Esta atividade não existe na organização atual deste calendário.'
      : otherLink
        ? 'Este calendário já tem esta data com outro vínculo. Remova-a para copiar esta.'
        : needsPeriods
          ? `Fora dos períodos letivos deste calendário${leftOut.length ? ` (${offerNames(target, leftOut)})` : ''}.`
          : refusal(() => place(target, event, reached, probeId));
  const warning =
    dateWarning(event) ??
    (leftOut.length && reached.length
      ? `Valerá só para ${offerNames(target, reached)}: ${offerNames(target, leftOut)} sem período letivo nesta data.`
      : undefined) ??
    (row && !coversAllOffers(target, row, { offers: reached })
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
            optional: reached.every((id) => {
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

/**
 * The offers chosen that this calendar does not have the date for. Copying reaches only these, so a
 * date recorded for one offer is not repeated for it when the copy adds another.
 */
function missingOffers(target: CopyState, event: CalendarEvent, offers: readonly string[]) {
  const name = event.name.trim().toLocaleLowerCase();
  const reached = target.events
    .filter(
      (other) =>
        other.name.trim().toLocaleLowerCase() === name &&
        other.start === event.start &&
        other.end === event.end &&
        other.effect === event.effect &&
        // A date of the campus with the same name does not fulfil the activity of a linked date;
        // a linked date already holds what a date of the campus would add.
        (!event.activity || sameActivity(other.activity, event.activity)),
    )
    .flatMap((other) => other.offers);
  return offers.filter((offer) => !reached.includes(offer));
}

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
      // A linked date and a date of the campus are not one choice: the link would be lost.
      event.activity ?? null,
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
  if (teacherPeriods(source).length) {
    if (equalValues(teacherPeriods(source), teacherPeriods(target))) alreadyPresent++;
    else candidates.push(vacationsCandidate(target, source));
  }
  for (const event of distinctDates(source.events)) {
    if (vacationKind(event.activity) === 'teacher') continue;
    if (isStageActivity(event.activity)) omitted++;
    else {
      const missing = missingOffers(target, event, offers);
      if (missing.length) candidates.push(dateCandidate(target, source, event, missing, generated));
      else alreadyPresent++;
    }
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
  if (chosen.includes(copiedVacationsId))
    next = replaceTeacherVacations(next, teacherPeriods(source), id);
  // Both versions marked: the linked one stays, since it holds what the other would add.
  const linkedTwin = (event: CalendarEvent) =>
    !event.activity &&
    source.events.some(
      (other) =>
        other.activity &&
        chosen.includes(other.id) &&
        other.name.trim().toLocaleLowerCase() === event.name.trim().toLocaleLowerCase() &&
        other.start === event.start &&
        other.end === event.end,
    );
  for (const event of source.events) {
    if (!chosen.includes(event.id) || vacationKind(event.activity) === 'teacher') continue;
    if (linkedTwin(event)) continue;
    if (isStageActivity(event.activity)) continue;
    try {
      const missing = missingOffers(next, event, offers);
      if (missing.length) {
        const reached = reachedOffers(next, event, missing);
        if (!reached.length) throw new DomainError('Fora dos períodos letivos deste calendário.');
        next = place(next, event, reached, id());
      }
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
