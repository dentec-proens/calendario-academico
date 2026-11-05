import type { ActivityState, VacationPeriods } from '../model.ts';
import { regeneratedVacations, teacherVacations } from '../activities/teacher-vacations.ts';
import { offerIds } from '../offers.ts';

/** Teacher vacations are replaced as one group. */
export const vacationIds = new Set([
  'teacher-vacation-january',
  'teacher-vacation-july',
  'teacher-vacation-third',
]);

export function applyVacations<S extends ActivityState>(state: S, values: VacationPeriods): S {
  const vacation = teacherVacations(state.year, values);
  return {
    ...state,
    teacherVacations: values,
    events: [
      ...state.events.filter((event) => !vacationIds.has(event.id)),
      ...regeneratedVacations(vacation.events, offerIds(state), state.events),
    ],
  };
}
