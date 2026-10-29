import { policyFor } from '../../policies/registry.ts';
import type { CountingEvent, TeachingState } from '../model.ts';
import { countCalendar, automaticEventSource } from './core.ts';
import { appliesTo } from '../modalities.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { calendarOffers } from '../offers.ts';
import { DomainError } from '../../errors.ts';

export function evaluateCalendar(s: TeachingState, events: CountingEvent[]) {
  const byOffer: Record<string, ReturnType<typeof countCalendar>> = {};
  const offers = calendarOffers(s);
  for (const offer of offers) {
    const scoped = events.filter((e) => appliesTo(e, offer));
    const periods = periodsForOffer(s, offer.id);
    if (offer.organization === 'a-classificar')
      throw new DomainError(
        'Organização a conferir: classifique os períodos por oferta antes de confirmar a contagem.',
      );
    const minimum = policyFor(s.year).countingMinimums(s, offer);
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
        annual: minimum.annual?.days ?? null,
        byPeriod: Object.fromEntries(
          periods.map((p) => [
            p.id,
            offer.organization === 'semestral' ? (minimum.semester?.days ?? null) : null,
          ]),
        ),
      },
    });
  }
  return { ...byOffer[offers[0]?.id ?? ''], byOffer };
}
