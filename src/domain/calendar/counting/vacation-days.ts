import type { CountingEvent, TeachingState } from '../model.ts';
import { datesBetween } from './core.ts';
import { evaluateCalendar } from './evaluation.ts';

/**
 * School days a vacation period takes from each offer it reaches: the days that would count without
 * it. Undefined while the calendar cannot be counted yet.
 */
export function vacationRemovedDays(
  state: TeachingState,
  events: readonly CountingEvent[],
  period: Pick<CountingEvent, 'id' | 'start' | 'end' | 'offers'>,
) {
  try {
    const { byOffer } = evaluateCalendar(
      state,
      events.filter((event) => event.id !== period.id),
    );
    const dates = new Set<string>(datesBetween(period.start, period.end));
    return period.offers.map((offerId) => ({
      offerId,
      days: (byOffer[offerId]?.ledger ?? []).filter(
        (entry) => entry.counted && dates.has(entry.date),
      ).length,
    }));
  } catch {
    return undefined;
  }
}
