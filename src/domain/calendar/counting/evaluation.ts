import { countingMinimums } from '../../policies/registry.ts';
import type { CountingEvent, TeachingState } from '../model.ts';
import { countCalendar, automaticEventSource } from './core.ts';
import { appliesTo } from '../modalities.ts';
import { periodsForModality } from '../organization/periods.ts';
import { calendarOffers } from '../offers.ts';
import { DomainError } from '../../errors.ts';

export function evaluateCalendar(s: TeachingState, events: CountingEvent[]) {
  const byOffer: Record<string, ReturnType<typeof countCalendar>> = {};
  const offers = calendarOffers(s);
  for (const offer of offers) {
    const scoped = events.filter((e) => appliesTo(e, offer.id));
    const periods = periodsForModality(s, offer.id);
    if (offer.organization === 'a-classificar')
      throw new DomainError(
        'Organização a conferir: classifique os períodos por oferta antes de confirmar a contagem.',
      );
    const minimum = countingMinimums(s, offer.id);
    byOffer[offer.id] = countCalendar({
      year: s.year,
      offerId: offer.id,
      periods,
      weekPattern: {
        weekdays: s.weekdays,
        confirmed: s.weekConfirmed,
      },
      inclusions: scoped
        .filter((e) => e.kind === 'include')
        .map((e) => ({
          ...e,
          offerIds: [offer.id],
          confirmed: true,
          evidenceId: automaticEventSource(e),
        })),
      exclusions: scoped
        .filter((e) => e.kind === 'exclude')
        .map((e) => ({
          ...e,
          offerIds: [offer.id],
          confirmed: true,
          evidenceId: automaticEventSource(e),
        })),
      thresholds: {
        annual: minimum.annual,
        byPeriod: Object.fromEntries(
          periods.map((p) => [p.id, offer.organization === 'semestral' ? minimum.semester : null]),
        ),
      },
    });
  }
  // Temporary alias for v3 transport consumers while the client moves to offer identities.
  return { ...byOffer[offers[0]?.id ?? ''], byOffer, byModality: byOffer };
}
