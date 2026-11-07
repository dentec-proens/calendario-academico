import { datesBetween } from '../counting/core.ts';
import type { ActivityPlanItem, CalendarEvent } from '../model.ts';
import { activityRef, type ActivityRef } from './activity-ref.ts';
import { eventCategory } from './categories.ts';

/**
 * School and teacher vacations (art. 11, III and IV) are dates linked to two activities, and
 * `state.events` is their only source. The rules here hold in every year, with or without a norm:
 * vacation days never count as school days. What differs by kind stays visible: teacher vacations
 * belong to the whole campus, so they reach every offer and carry a generated name; school
 * vacations choose their offers and may be named, for example, “Recesso escolar”.
 */
export type VacationKind = 'school' | 'teacher';

const activityIds: Record<VacationKind, string> = {
  school: 'school-vacation',
  teacher: 'teacher-vacation',
};

export const vacationKinds: readonly VacationKind[] = ['school', 'teacher'];
export const defaultSchoolVacationName = 'Férias escolares';

export const vacationRef = (kind: VacationKind): ActivityRef =>
  activityRef({ activityId: activityIds[kind] });

export function vacationKind(activity: ActivityRef | undefined): VacationKind | undefined {
  return vacationKinds.find((kind) => activity?.activityId === activityIds[kind]);
}

export const isVacationActivity = (activity: ActivityRef | undefined) =>
  vacationKind(activity) !== undefined;

type VacationDate = Pick<CalendarEvent, 'start' | 'end'>;
type LinkedDate = Pick<CalendarEvent, 'id' | 'activity' | 'offers' | 'start' | 'end'>;

/** The periods of one kind, in the order of the calendar. */
export function vacationDates<E extends Pick<CalendarEvent, 'activity' | 'start'>>(
  events: readonly E[],
  kind: VacationKind,
) {
  return events
    .filter((event) => vacationKind(event.activity) === kind)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Calendar days of the dates, each day once. */
export function vacationDays(dates: readonly VacationDate[]) {
  return new Set(dates.flatMap(({ start, end }) => datesBetween(start, end))).size;
}

export const teacherVacationName = (date: VacationDate) =>
  `Férias docentes — ${vacationDays([date])} dias`;

/** Teacher vacations of a whole campus: every offer of the calendar and the generated name. */
export function withTeacherVacationFields<E extends CalendarEvent>(
  event: E,
  offers: readonly string[],
): E {
  return { ...event, offers: [...offers], name: teacherVacationName(event) };
}

/**
 * Why a date breaks the vacation rules, or undefined. A date of the campus is also read here: its
 * only way to be a vacation is the step of its own, so it cannot use the category.
 */
export function vacationDateIssue(
  state: { year: number },
  event: Pick<CalendarEvent, 'activity' | 'category' | 'effect' | 'start' | 'end'>,
): string | undefined {
  if (!isVacationActivity(event.activity))
    return !event.activity && event.category === 'ferias'
      ? 'Férias são registradas no passo Férias, e não como data do campus. Registre o período nesse passo e remova esta data.'
      : undefined;
  if (event.effect !== 'exclude') return 'Os dias de férias precisam sair da contagem letiva.';
  if (eventCategory(event) !== 'ferias') return 'Férias usam a categoria de férias da legenda.';
  if (!event.start.startsWith(`${state.year}-`) || !event.end.startsWith(`${state.year}-`))
    return 'As férias devem estar no ano do calendário.';
  return undefined;
}

/**
 * What a save refuses. A date of the campus saved with the category stays a readiness issue: it
 * blocks the submission and never another change, such as removing an offer it reaches.
 */
export function vacationEditIssue(
  state: { year: number },
  previous: Pick<CalendarEvent, 'category'> | undefined,
  event: Parameters<typeof vacationDateIssue>[1],
) {
  if (!event.activity && previous?.category === 'ferias') return undefined;
  return vacationDateIssue(state, event);
}

/** Periods of the same kind cannot share a day in an offer they both reach. */
export function vacationOverlapIssue(events: readonly LinkedDate[], event: LinkedDate) {
  const kind = vacationKind(event.activity);
  if (!kind) return undefined;
  return events.some(
    (other) =>
      other.id !== event.id &&
      vacationKind(other.activity) === kind &&
      other.offers.some((offer) => event.offers.includes(offer)) &&
      other.start <= event.end &&
      other.end >= event.start,
  )
    ? 'Os períodos de férias não podem se sobrepor.'
    : undefined;
}

/** Days of the teacher vacations inside school vacations that reach the offer. */
export function coincidentDays(events: readonly LinkedDate[], offerId: string) {
  const school = new Set(
    vacationDates(events, 'school')
      .filter((event) => event.offers.includes(offerId))
      .flatMap(({ start, end }) => datesBetween(start, end)),
  );
  return vacationDates(events, 'teacher')
    .flatMap(({ start, end }) => datesBetween(start, end))
    .filter((date, index, all) => school.has(date) && all.indexOf(date) === index).length;
}

/** The norm's exact total of a teacher vacation row, or undefined when it asks for none. */
export function exactDaysIssue(
  requirement: Pick<ActivityPlanItem, 'exactDays'>,
  dates: readonly VacationDate[],
) {
  if (!requirement.exactDays || !dates.length) return undefined;
  const days = vacationDays(dates);
  return days === requirement.exactDays
    ? undefined
    : `Registre exatamente ${requirement.exactDays} dias no ano do calendário; há ${days}.`;
}

/**
 * A period that starts in December and runs to the last day of the year: the printed line says
 * where it starts, as calendars do by hand, without showing December 31 as if it ended there.
 */
export const startsDecemberVacation = (date: VacationDate, year: number) =>
  date.start.startsWith(`${year}-12-`) && date.end === `${year}-12-31`;
