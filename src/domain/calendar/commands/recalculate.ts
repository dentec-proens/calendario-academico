import type { ActivityState, InstitutionalEventSnapshot } from '../model.ts';
import { recalculatePeriods } from '../counting/duration.ts';
import { applyObservances } from '../observances.ts';

export function recalculateCalendar<S extends ActivityState>(
  state: S,
  institutional: InstitutionalEventSnapshot[],
): S {
  const inherited = applyObservances(institutional, state);
  const periods = recalculatePeriods(state, [...inherited, ...state.events]);
  const next = { ...state, periods };
  return next;
}
