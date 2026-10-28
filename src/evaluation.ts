import { normativeDayMinimums } from './calendar-config.ts';
import type { CountingEvent, TeachingState } from './domain-types.ts';
import { countCalendar, automaticEventSource } from './calendar.ts';
import { calendarModalities, appliesTo } from './modalities.ts';
import { organizationForModality, periodsForModality } from './calendar-rules/index.ts';

export function evaluateCalendar(s: TeachingState, events: CountingEvent[]) {
  const byModality: Record<string, ReturnType<typeof countCalendar>> = {};
  for (const modality of calendarModalities(s)) {
    const scoped = events.filter((e) => appliesTo(e, modality));
    const periods = periodsForModality(s, modality);
    if (organizationForModality(s, modality) === 'a-classificar')
      throw new Error(
        'Organização a conferir: classifique os períodos por oferta antes de confirmar a contagem.',
      );
    const minimum =
      s.year === normativeDayMinimums.year &&
      !normativeDayMinimums.excludedModalities.some((excluded) => excluded === modality) &&
      s.scopeConfirmation?.status === 'covered';
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
        annual: minimum ? normativeDayMinimums.annual : null,
        byPeriod: Object.fromEntries(
          periods.map((p) => [
            p.id,
            minimum && organizationForModality(s, modality) === 'semestral'
              ? normativeDayMinimums.semester
              : null,
          ]),
        ),
      },
    });
  }
  return { ...byModality[calendarModalities(s)[0]], byModality };
}
