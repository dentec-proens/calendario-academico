import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarContent, CalendarEvent } from '../../src/domain/calendar/model.ts';
import {
  teacherVacationName,
  vacationDates,
  vacationRef,
} from '../../src/domain/calendar/activities/vacations.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { MutationCtx } from '../../convex/_generated/server.js';
import { contentIssues } from '../../src/domain/calendar/readiness.ts';
import { readyContent } from './lifecycle.ts';

/**
 * The state with the vacations the 2027 norm requires to submit: a school period and 45 teacher
 * days. They start with the year, so they may take days from a period that starts in January or February; no test here measures that count. Only a kind the state lacks is added, so a
 * test that fills its own periods keeps them.
 */
export function withRequiredVacations<S extends Pick<CalendarContent, 'offers' | 'events'>>(
  state: S,
): S {
  const offers = state.offers.map((offer) => offer.id);
  const added: CalendarEvent[] = [];
  const base = { effect: 'exclude' as const, category: 'ferias', offers };
  if (!vacationDates(state.events, 'school').length)
    added.push({
      ...base,
      id: 'fixture-school-vacation',
      name: 'Férias escolares',
      activity: vacationRef('school'),
      start: civilDate('2027-01-01'),
      end: civilDate('2027-01-31'),
    });
  if (!vacationDates(state.events, 'teacher').length) {
    const period = { start: civilDate('2027-01-01'), end: civilDate('2027-02-14') };
    added.push({
      ...base,
      ...period,
      id: 'fixture-teacher-vacation',
      name: teacherVacationName(period),
      activity: vacationRef('teacher'),
    });
  }
  return added.length ? { ...state, events: [...state.events, ...added] } : state;
}

/**
 * The state a test submits when the submission is not what it is about. Submitting refuses any
 * pendency, so a 2027 draft is completed in steps, each kept only if the previous one still has
 * pendencies: the required vacations (see above); then the structure and the dates of
 * `readyContent` for the same offers, keeping the test's own dates; at last `readyContent` alone.
 * The rules the draft was saved under are kept, since submitting records the current ones.
 */
export function submittableState<S extends CalendarContent>(
  state: S,
  year = 2027,
  institutionalSnapshot: readonly unknown[] = [],
): S {
  if (year !== 2027) return state;
  const clean = (candidate: CalendarContent) =>
    !contentIssues({ ...candidate, year } as never, institutionalSnapshot as never).length;
  const vacations = withRequiredVacations(state);
  if (clean(vacations)) return vacations;
  const ready = { ...readyContent(state.offers), rulesetVersion: state.rulesetVersion };
  const own = new Set(state.events.map((event) => event.id));
  const merged = {
    ...state,
    ...ready,
    events: [...state.events, ...ready.events.filter((event) => !own.has(event.id))],
  };
  if (clean(merged)) return merged as S;
  const replaced = { ...state, ...ready };
  const left = contentIssues({ ...replaced, year } as never, institutionalSnapshot as never);
  if (left.length)
    throw new Error(`readyContent still has pendencies: ${left.map((i) => i.key).join(', ')}`);
  return replaced as S;
}

/** Writes it directly, as the fixtures seed courses: no new version of the calendar. */
export async function seedSubmittable(ctx: MutationCtx, id: Id<'calendars'>) {
  const calendar = await ctx.db.get(id);
  if (!calendar) return;
  const content = await ctx.db
    .query('calendarContents')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
  if (!content) return;
  const state = submittableState(
    content.state as CalendarContent,
    calendar.year,
    content.institutionalSnapshot,
  );
  if (state !== content.state) await ctx.db.patch(content._id, { state: state as never });
}
