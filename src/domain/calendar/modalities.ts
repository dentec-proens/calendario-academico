import type { CalendarOffer, EventScope } from './model.ts';
export { modalityLabels, selectableModalities } from './config.ts';

/**
 * Whether a date reaches an offer. A local date lists its offers in `scope` (plan, section 5.3);
 * persisted institutional snapshots keep their own `offers` or, without them, catalogue kinds.
 */
export function appliesTo(
  event: { scope?: EventScope; offers?: string[]; institutional?: boolean; modalities?: string[] },
  offer: string | Pick<CalendarOffer, 'id' | 'kind'>,
) {
  const id = typeof offer === 'string' ? offer : offer.id;
  if (event.scope) return event.scope.offers.includes(id);
  if (event.offers !== undefined) return !event.offers.length || event.offers.includes(id);
  if (event.institutional === true && event.modalities?.length && typeof offer !== 'string')
    return event.modalities.includes(offer.kind);
  return true;
}

/** Offers a date lists: the scope of a local date, or the offers kept by a snapshot entry. */
export const listedOffers = (event: {
  scope?: EventScope;
  offers?: string[];
}): string[] | undefined => event.scope?.offers ?? event.offers;
