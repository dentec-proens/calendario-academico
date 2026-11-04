import type { AssessmentSettings, CalendarEvent } from '../model.ts';
import { offerFor, scopeStatus } from '../offers.ts';
import { datesBetween } from '../counting/core.ts';
import { parseDate } from '../../civil-date.ts';
import { policyFor } from '../../policies/registry.ts';
import { eventCategory } from './categories.ts';
import { dateEdited } from './links.ts';

/**
 * Whether a date may make a day a school day (art. 5º of Resolução 292): `school-day` activities
 * may, when students and teachers effectively take part; a `meeting` takes a day without students,
 * whose classes are kept (`note`) unless the campus declares them suspended (`exclude`); a
 * `deadline` (deadlines, windows and milestones) never does. Undefined: the policy does not
 * classify the date.
 */
export type SchoolDayNature = 'school-day' | 'meeting' | 'deadline';

/** Categories of a date of the campus that never involve students. */
const meetingCategories: readonly string[] = ['conselho', 'formacao'];

type Classified = Pick<CalendarEvent, 'activity' | 'category' | 'effect'>;

/**
 * Nature of a date under the policy of `year`. A linked date is classified by its declared
 * activity, never by the generated row, so a link to a removed offer keeps its nature; an
 * activity the policy does not list is a deadline. A date of the campus is a meeting only in a
 * council or training category.
 */
export function schoolDayNature(
  year: number | undefined,
  event: Classified,
): SchoolDayNature | undefined {
  const declaration = policyFor(year).schoolDay;
  if (!declaration) return undefined;
  const id = event.activity?.activityId;
  if (id === undefined)
    return meetingCategories.includes(eventCategory(event)) ? 'meeting' : undefined;
  if (declaration.schoolDayActivities.includes(id)) return 'school-day';
  return declaration.meetings.includes(id) ? 'meeting' : 'deadline';
}

/** Whether one of the offers is under the norm: neither excluded nor under its own regulation. */
export function underNorm(
  state: AssessmentSettings & { year: number },
  offerIds: readonly string[],
) {
  const policy = policyFor(state.year);
  return offerIds.some((id) => {
    const offer = offerFor(state, id);
    return !offer || (!policy.excludes(offer) && scopeStatus(offer) !== 'own-regulation');
  });
}

/**
 * Why the date may not have its effect under art. 5º, or undefined. Only `include` is refused:
 * the date would be the reason the day counts. The rule reaches a date when one of its offers is
 * under the norm (neither excluded nor under its own regulation).
 */
export function schoolDayIssue(
  state: AssessmentSettings & { year: number; weekdays?: readonly number[] },
  event: Classified & Pick<CalendarEvent, 'name' | 'scope' | 'start' | 'end'>,
): string | undefined {
  if (event.effect !== 'include') return undefined;
  const nature = schoolDayNature(state.year, event);
  if (nature === undefined || nature === 'school-day') return undefined;
  if (!underNorm(state, event.scope.offers)) return undefined;
  const basis = policyFor(state.year).schoolDay!.basis;
  if (nature === 'deadline')
    return `“${event.name}” é prazo ou marco e não constitui dia letivo (${basis}): não acrescenta dias à contagem.`;
  const issue = `“${event.name}” não constitui dia letivo (${basis}): sem a efetiva participação de estudantes, não acrescenta dias à contagem.`;
  return teachingDay(state, event)
    ? `${issue} Use “Aulas mantidas” ou, se as aulas forem suspensas para a atividade, “Aulas suspensas”.`
    : `${issue} Em dia sem aula, como um sábado, use “Aulas mantidas”: a data fica registrada sem alterar a contagem.`;
}

/**
 * Whether the date reaches a day of the ordinary teaching week. Unreadable dates count as a
 * teaching day, which keeps the advice that covers both answers.
 */
function teachingDay(
  state: { weekdays?: readonly number[] },
  event: Pick<CalendarEvent, 'start' | 'end'>,
) {
  const weekdays = state.weekdays?.length ? state.weekdays : [1, 2, 3, 4, 5];
  try {
    return datesBetween(event.start, event.end).some((date) =>
      weekdays.includes(new Date(parseDate(date)).getUTCDay()),
    );
  } catch {
    return true;
  }
}

/**
 * Whether the save boundary rechecks the art. 5º rule and the municipal cause of a date: a new
 * date, or one whose dates, offers, link, effect, category or cause changed. A saved date left as
 * it was stays as a readiness issue, so it never blocks saving other changes.
 */
export const schoolDayEdited = (previous: CalendarEvent | undefined, next: CalendarEvent) =>
  dateEdited(previous, next) ||
  previous!.effect !== next.effect ||
  eventCategory(previous!) !== eventCategory(next) ||
  previous!.deadlineExtensionCause !== next.deadlineExtensionCause;

/** A municipal holiday or recess extends deadlines; a date linked to an activity is neither. */
export const activityExtensionIssue = (
  event: Pick<CalendarEvent, 'activity' | 'deadlineExtensionCause'>,
) =>
  event.activity && event.deadlineExtensionCause
    ? 'A prorrogação municipal de prazos vale para feriado ou recesso, não para data vinculada a atividade.'
    : undefined;
