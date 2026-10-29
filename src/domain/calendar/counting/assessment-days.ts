import type { StageEvent, TeachingState } from '../model.ts';
import { stageRequirement } from '../activities/assessment.ts';
import { evaluateCalendar } from './evaluation.ts';
import { appliesTo } from '../modalities.ts';
import { calendarOffers } from '../offers.ts';

export function assessmentDayCounts(
  state: TeachingState & { events: StageEvent[] },
  events: StageEvent[],
) {
  const result = evaluateCalendar(state, events);
  return Object.fromEntries(
    state.events
      .filter((e) => stageRequirement(e.requirementId))
      .map((e) => [
        e.id,
        calendarOffers(state)
          .filter((offer) => appliesTo(e, offer))
          .map((offer) => {
            const ledger = result.byOffer[offer.id].ledger.filter(
              (d) => d.date >= e.start && d.date <= e.end,
            );
            return {
              offerId: offer.id,
              days: ledger.filter((d) => d.counted).length,
              saturdays: ledger.filter((d) => d.counted && d.weekday === 6).length,
              excluded: ledger.filter((d) => d.reason === 'EXCLUDED').length,
            };
          }),
      ]),
  );
}
