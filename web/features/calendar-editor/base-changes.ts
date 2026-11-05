import { evaluateCalendar } from '#src/domain/calendar/counting/evaluation.ts';
import { projectDates, type InstitutionalEventSnapshot } from '#src/domain/calendar/model.ts';
import { applyObservances } from '#src/domain/calendar/observances.ts';
import { labelFor } from '#src/domain/calendar/offers.ts';
import type { CalendarState } from './types.ts';

/** Offer by offer, since a new event can reach only one. Silent when the calendar cannot be counted. */
export function teachingDayEffects(
  state: CalendarState,
  stored: InstitutionalEventSnapshot[],
  current: InstitutionalEventSnapshot[],
) {
  if (!state.weekConfirmed || !state.periods.length) return [];
  const totals = (events: InstitutionalEventSnapshot[]) =>
    evaluateCalendar(state, projectDates(applyObservances(events, state), state.events)).byOffer;
  try {
    const before = totals(stored);
    const after = totals(current);
    return Object.entries(after).flatMap(([id, { total }]) => {
      const previous = before[id]?.total;
      return previous === undefined || previous === total
        ? []
        : [`Dias letivos de ${labelFor(state, id)}: de ${previous} para ${total}.`];
    });
  } catch {
    return [];
  }
}
