import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarContent, CalendarEvent } from '../../src/domain/calendar/model.ts';
import {
  teacherVacationName,
  vacationDates,
  vacationRef,
} from '../../src/domain/calendar/activities/vacations.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { MutationCtx } from '../../convex/_generated/server.js';

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

/** Writes them directly, as the fixtures seed courses: no new version of the calendar. */
export async function seedRequiredVacations(ctx: MutationCtx, id: Id<'calendars'>) {
  const calendar = await ctx.db.get(id);
  if (calendar?.year !== 2027) return;
  const content = await ctx.db
    .query('calendarContents')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
  if (!content) return;
  const state = withRequiredVacations(content.state as CalendarContent);
  if (state !== content.state) await ctx.db.patch(content._id, { state: state as never });
}
