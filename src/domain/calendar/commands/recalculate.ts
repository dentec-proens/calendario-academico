import type { ActivityState, CalendarActivity } from '../model.ts';
import { datesBetween } from '../counting/core.ts';
import { recalculatePeriods } from '../counting/duration.ts';
import { applyObservances } from '../observances.ts';
import { DomainError } from '../../errors.ts';

export function recalculateCalendar<S extends ActivityState>(
  state: S,
  institutional: CalendarActivity[],
): S {
  const inherited = applyObservances(institutional, state);
  const periods = recalculatePeriods(state, [...inherited, ...state.events]);
  const next = { ...state, periods };
  return next;
}

export function validateInterval(state: Pick<ActivityState, 'year'>, start: string, end: string) {
  datesBetween(start, end);
  if (Number(start.slice(0, 4)) !== state.year || Number(end.slice(0, 4)) !== state.year)
    throw new DomainError('As datas devem pertencer ao ano selecionado.');
}
