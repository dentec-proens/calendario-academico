import type { ActivityState, CalendarActivity, VacationPeriods } from '../model.ts';
import { teacherVacations } from '../activities/teacher-vacations.ts';
import { recalculateCalendar } from './recalculate.ts';

/** Teacher vacations are replaced as one group. */
export const vacationIds = new Set([
  'teacher-vacation-january',
  'teacher-vacation-july',
  'teacher-vacation-third',
]);

export function applyVacations<S extends ActivityState>(
  state: S,
  values: VacationPeriods,
  institutional: CalendarActivity[],
): S {
  const vacation = teacherVacations(state.year, values);
  const recorded = new Map(state.events.map((event) => [event.id, event.requirementId]));
  return recalculateCalendar(
    {
      ...state,
      teacherVacations: values,
      events: [
        ...state.events.filter((event) => !vacationIds.has(event.id)),
        // Regenerated vacations keep the link recorded for the same date ID.
        ...vacation.events.map((event) => {
          const requirementId = recorded.get(event.id);
          return requirementId ? { ...event, requirementId } : event;
        }),
      ],
    },
    institutional,
  );
}
