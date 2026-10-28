import type { StageEvent, TeachingState } from '../model.ts';
import { stageRequirement } from '../activities/assessment.ts';
import { evaluateCalendar } from './evaluation.ts';
import { calendarModalities, appliesTo } from '../modalities.ts';

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
        calendarModalities(state)
          .filter((m) => appliesTo(e, m))
          .map((m) => {
            const ledger = result.byModality[m].ledger.filter(
              (d) => d.date >= e.start && d.date <= e.end,
            );
            return {
              modality: m,
              days: ledger.filter((d) => d.counted).length,
              saturdays: ledger.filter((d) => d.counted && d.weekday === 6).length,
              excluded: ledger.filter((d) => d.reason === 'EXCLUDED').length,
            };
          }),
      ]),
  );
}
