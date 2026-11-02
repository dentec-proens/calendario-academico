import { projectDates, type ActivityState, type InstitutionalEventSnapshot } from '../model.ts';
import { recalculatePeriods } from '../counting/duration.ts';
import { applyObservances } from '../observances.ts';

export function recalculateCalendar<S extends ActivityState>(
  state: S,
  institutional: InstitutionalEventSnapshot[],
): S {
  const inherited = applyObservances(institutional, state);
  const periods = recalculatePeriods(state, projectDates(inherited, state.events));
  const next = { ...state, periods };
  return next;
}
