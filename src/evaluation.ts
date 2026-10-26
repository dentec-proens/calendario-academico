import type { CountingEvent, TeachingState } from './domain-types.ts';
import { countCalendar } from './calendar.ts';
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
      s.year === 2027 && modality !== 'posgraduacao' && s.scopeConfirmation?.status === 'covered';
    byModality[modality] = countCalendar({
      year: s.year,
      offerId: modality,
      periods,
      weekPattern: {
        weekdays: s.weekdays,
        confirmed: s.weekConfirmed,
        evidenceId: s.weekEvidence ?? '',
      },
      inclusions: scoped
        .filter((e) => e.kind === 'include')
        .map((e) => ({
          ...e,
          offerIds: [modality],
          confirmed: true,
          evidenceId: e.evidence ?? '',
        })),
      exclusions: scoped
        .filter((e) => e.kind === 'exclude')
        .map((e) => ({
          ...e,
          offerIds: [modality],
          confirmed: true,
          evidenceId: e.evidence ?? '',
        })),
      thresholds: {
        annual: minimum ? 200 : null,
        byPeriod: Object.fromEntries(
          periods.map((p) => [
            p.id,
            minimum && organizationForModality(s, modality) === 'semestral' ? 100 : null,
          ]),
        ),
      },
    });
  }
  return { ...byModality[calendarModalities(s)[0]], byModality };
}
