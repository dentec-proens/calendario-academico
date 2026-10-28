import { countingMinimums } from '../policies/resolve.ts';
import type { CountingEvent, TeachingState } from '../model.ts';
import { countCalendar, automaticEventSource } from './core.ts';
import { calendarModalities, appliesTo } from '../modalities.ts';
import { organizationForModality, periodsForModality } from '../organization/periods.ts';

export function evaluateCalendar(s: TeachingState, events: CountingEvent[]) {
  const byModality: Record<string, ReturnType<typeof countCalendar>> = {};
  for (const modality of calendarModalities(s)) {
    const scoped = events.filter((e) => appliesTo(e, modality));
    const periods = periodsForModality(s, modality);
    if (organizationForModality(s, modality) === 'a-classificar')
      throw new Error(
        'Organização a conferir: classifique os períodos por oferta antes de confirmar a contagem.',
      );
    const minimum = countingMinimums(s, modality);
    byModality[modality] = countCalendar({
      year: s.year,
      offerId: modality,
      periods,
      weekPattern: {
        weekdays: s.weekdays,
        confirmed: s.weekConfirmed,
      },
      inclusions: scoped
        .filter((e) => e.kind === 'include')
        .map((e) => ({
          ...e,
          offerIds: [modality],
          confirmed: true,
          evidenceId: automaticEventSource(e),
        })),
      exclusions: scoped
        .filter((e) => e.kind === 'exclude')
        .map((e) => ({
          ...e,
          offerIds: [modality],
          confirmed: true,
          evidenceId: automaticEventSource(e),
        })),
      thresholds: {
        annual: minimum.annual,
        byPeriod: Object.fromEntries(
          periods.map((p) => [
            p.id,
            organizationForModality(s, modality) === 'semestral' ? minimum.semester : null,
          ]),
        ),
      },
    });
  }
  return { ...byModality[calendarModalities(s)[0]], byModality };
}
