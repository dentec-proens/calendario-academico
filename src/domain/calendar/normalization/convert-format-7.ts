import { teacherVacationName } from '../activities/vacations.ts';
import type { CalendarContent, CalendarEvent, EventEffect } from '../model.ts';

/**
 * Conversion to format 7, used only by the migration of that format and removed with its
 * contraction. `teacherVacations` leaves the state and its derived dates become dates linked to the
 * teacher vacation activity: dates, offers, names and effects stay, so no count changes. The dates
 * of the campus listed by the management become school vacations; only those may change the count,
 * and each one is declared. Anything else unexpected stops the conversion: nothing is corrected.
 */
export interface Format6Vacations {
  firstStart: string;
  firstEnd: string;
  secondStart?: string;
  secondEnd?: string;
  thirdStart?: string;
  thirdEnd?: string;
}

interface Format6Event {
  id: string;
  name: string;
  start: string;
  end: string;
  effect: EventEffect;
  category?: string;
  offers: string[];
  activity?: unknown;
}

export interface Format6Document {
  state: {
    schemaVersion: number;
    offers: { id: string }[];
    events: Format6Event[];
    teacherVacations?: Format6Vacations;
  };
}

export class Format7ConversionError extends Error {}

const stop = (reason: string): never => {
  throw new Format7ConversionError(reason);
};

const derivedIds = [
  'teacher-vacation-january',
  'teacher-vacation-july',
  'teacher-vacation-third',
] as const;

function periodsOf(value: Format6Vacations | undefined) {
  if (!value) return [];
  return (
    [
      [value.firstStart, value.firstEnd],
      [value.secondStart, value.secondEnd],
      [value.thirdStart, value.thirdEnd],
    ] as const
  ).flatMap(([start, end], index) => (start && end ? [{ id: derivedIds[index], start, end }] : []));
}

/** A derived date as the field describes it; a difference means the two sources diverged. */
function checkDerived(
  event: Format6Event | undefined,
  period: { id: string; start: string; end: string },
  offers: readonly string[],
) {
  if (!event) return stop(`o período ${period.id} não tem data derivada`);
  if (event.start !== period.start || event.end !== period.end)
    return stop(`as datas de ${period.id} divergem de teacherVacations`);
  if (event.effect !== 'exclude' || event.category !== 'ferias')
    return stop(`${period.id} não tem efeito ou categoria de férias`);
  if (event.activity !== undefined) return stop(`${period.id} tem outro vínculo`);
  if (event.name !== teacherVacationName(event as unknown as Pick<CalendarEvent, 'start' | 'end'>))
    return stop(`${period.id} tem outro nome`);
  if ([...event.offers].sort().join() !== [...offers].sort().join())
    return stop(`${period.id} não alcança todas as ofertas`);
  return event;
}

/**
 * The document in format 7. `listedSchoolVacations` names the dates of the campus the management
 * approved as school vacations; those present in this document are converted.
 */
export function convertToFormat7<D extends Format6Document>(
  document: D,
  listedSchoolVacations: readonly string[] = [],
) {
  const { teacherVacations, ...state } = document.state;
  if (state.schemaVersion !== 6) return stop(`formato ${state.schemaVersion} inesperado`);
  const periods = periodsOf(teacherVacations);
  const expected = new Map(periods.map((period) => [period.id as string, period]));
  const offers = state.offers.map((offer) => offer.id);
  for (const event of state.events)
    if (event.id.startsWith('teacher-vacation') && !expected.has(event.id))
      stop(`a data ${event.id} não tem período em teacherVacations`);
  for (const period of periods)
    checkDerived(
      state.events.find((event) => event.id === period.id),
      period,
      offers,
    );
  const converted: string[] = [];
  const events = state.events.map((event) => {
    if (expected.has(event.id)) return { ...event, activity: { activityId: 'teacher-vacation' } };
    if (!listedSchoolVacations.includes(event.id)) return event;
    if (event.activity !== undefined) stop(`a data listada ${event.id} já tem vínculo`);
    converted.push(event.id);
    return {
      ...event,
      activity: { activityId: 'school-vacation' },
      effect: 'exclude' as const,
      category: 'ferias',
    };
  });
  return {
    document: { ...document, state: { ...state, schemaVersion: 7, events } } as unknown as Omit<
      D,
      'state'
    > & { state: CalendarContent },
    /** Listed dates converted in this document: each may change the count and must be declared. */
    converted,
  };
}
