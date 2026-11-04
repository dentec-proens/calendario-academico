import type { CalendarOffer } from './model.ts';
export { modalityLabels, selectableModalities } from './config.ts';

/** Whether a date reaches an offer: the offer is one of the ones the date lists. */
export function appliesTo(
  event: { offers: readonly string[] },
  offer: string | Pick<CalendarOffer, 'id'>,
) {
  return event.offers.includes(typeof offer === 'string' ? offer : offer.id);
}
