import type { CalendarOffer } from './model.ts';
export { modalityLabels, selectableModalities } from './config.ts';

/** Persisted institutional snapshots retain catalogue kinds; local records use offer identities. */
export function appliesTo(
  event: { offers?: string[]; institutional?: boolean; modalities?: string[] },
  offer: string | Pick<CalendarOffer, 'id' | 'kind'>,
) {
  const id = typeof offer === 'string' ? offer : offer.id;
  if (event.offers !== undefined) return !event.offers.length || event.offers.includes(id);
  if (event.institutional === true && event.modalities?.length && typeof offer !== 'string')
    return event.modalities.includes(offer.kind);
  return true;
}
