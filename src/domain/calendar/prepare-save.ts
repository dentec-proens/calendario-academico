import type { CalendarContent, DateFields } from './model.ts';
import { equalValues } from '../../shared/equal.ts';
import { inheritedEvents } from '../institution/catalogue.ts';
import { applyObservances, validateObservances } from './observances.ts';
import { recalculateCalendar } from './commands/recalculate.ts';
import { invalidCalendar } from './normalization/input.ts';
import { validateAddedOffers } from './organization/offers.ts';
import { normalizeOfferCalendar, offerCalendarContent } from './normalization/normalize.ts';
import { kinds } from './offers.ts';

type OfferState = CalendarContent & { year: number; campus?: string };

/** Save boundary of the editor; the backend retains concurrency, authorization and final confirmation. */
export function prepareOfferCalendarSave<E extends DateFields & { active: boolean }>(
  previous: OfferState,
  proposed: OfferState,
  context: {
    storedContent: unknown;
    catalogue: { events: E[] };
    recalculate: boolean;
    /** A draft may drop an offer (`removeOffer`); a calendar once submitted keeps its offers. */
    allowOfferRemoval?: boolean;
  },
) {
  if (proposed.year !== previous.year) invalidCalendar('O ano não pode mudar neste registro.');
  for (const old of previous.offers) {
    const next = proposed.offers.find((offer) => offer.id === old.id);
    if (!next) {
      if (context.allowOfferRemoval) continue;
      return invalidCalendar('Ofertas existentes não podem ser removidas por esta operação.');
    }
    if (next.kind !== old.kind) invalidCalendar('O tipo de uma oferta existente não pode mudar.');
  }
  // Removed offers leave nothing behind: normalization refuses a date or period that names one.
  const previousIds = previous.offers
    .map((offer) => offer.id)
    .filter((id) => proposed.offers.some((offer) => offer.id === id));
  // Adding an offer does not extend the offers existing dates list.
  let state = normalizeOfferCalendar({ ...proposed, campus: previous.campus ?? '' }, previous);
  validateAddedOffers(previousIds, state);
  const inherited = inheritedEvents(context.catalogue, previous.year, state.offers);
  validateObservances(inherited, state, previous);
  if (context.recalculate || !equalValues(context.storedContent, offerCalendarContent(state)))
    state = normalizeOfferCalendar(
      recalculateCalendar(state, applyObservances(inherited, state)),
      previous,
    );
  const content = offerCalendarContent(state);
  return {
    state,
    content,
    offerKinds: kinds(state),
    institutionalSnapshot: applyObservances(inherited, state),
    unchanged: equalValues(context.storedContent, content),
  };
}
