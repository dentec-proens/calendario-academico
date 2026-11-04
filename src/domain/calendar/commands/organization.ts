import type {
  ActivityState,
  CalendarEvent,
  CalendarOffer,
  AcademicTerm,
  InstitutionalEventSnapshot,
} from '../model.ts';
import { organizationForOffer } from '../organization/periods.ts';
import { offerFor, offerIds } from '../offers.ts';
import { DomainError } from '../../errors.ts';
import { validateOffers } from '../normalization/normalize.ts';
import { recalculateCalendar } from './recalculate.ts';

/** Editable metadata never changes an offer's identity, type, periods or assessment records. */
export function configureOfferMetadata<S extends ActivityState & { offers: CalendarOffer[] }>(
  state: S,
  id: string,
  metadata: Pick<CalendarOffer, 'label' | 'delivery'>,
): S {
  if (!state.offers.some((offer) => offer.id === id))
    throw new DomainError('A oferta não pertence ao calendário.');
  if (!['presencial', 'ead', 'a-conferir'].includes(metadata.delivery))
    throw new DomainError('Selecione o modo de oferta.');
  const offers = validateOffers(
    state.offers.map((offer) => {
      if (offer.id !== id) return offer;
      const { label: _label, ...kept } = offer;
      const label = metadata.label?.trim();
      return {
        ...kept,
        delivery: metadata.delivery,
        ...(label ? { label } : {}),
      };
    }),
  );
  return { ...state, offers };
}

/** Change only the selected offer/cycle; the requirements of other cycles stay intact. */
export function configureIntakeRequirement<S extends ActivityState>(
  state: S,
  modality: string,
  term: AcademicTerm,
  required: boolean,
): S {
  if (
    !offerIds(state).includes(modality) ||
    organizationForOffer(state, modality) !== (term === 'annual' ? 'anual' : 'semestral')
  )
    throw new DomainError('O ciclo da oferta mudou. Reabra a atividade de matrícula.');
  return {
    ...state,
    offers: state.offers.map((item) => {
      if (item.id !== modality) return item;
      const { intake, ...offer } = item;
      const { [term]: _previous, ...others } = intake ?? {};
      const next = required ? { ...others, [term]: true as const } : others;
      return Object.keys(next).length ? { ...offer, intake: next } : offer;
    }),
  };
}

/** What removing an offer takes from the calendar, for the campus to confirm. */
export interface OfferRemovalPreview {
  /** Dates that reach only this offer, or are its stages: removed with it. */
  removedDates: string[];
  /** Dates of several offers that keep the others. */
  narrowedDates: string[];
  /** Periods associated only with this offer: removed with it. */
  removedPeriods: string[];
}

const ownsDate = (event: CalendarEvent, id: string) =>
  (event.activity !== undefined && 'offerId' in event.activity && event.activity.offerId === id) ||
  (event.offers.includes(id) && event.offers.length === 1);

export function offerRemovalPreview(state: ActivityState, id: string): OfferRemovalPreview {
  if (!offerFor(state, id)) throw new DomainError('A oferta não pertence ao calendário.');
  if (state.offers.length < 2)
    throw new DomainError('O calendário precisa conservar pelo menos uma oferta.');
  return {
    removedDates: state.events.filter((event) => ownsDate(event, id)).map((event) => event.name),
    narrowedDates: state.events
      .filter((event) => !ownsDate(event, id) && event.offers.includes(id))
      .map((event) => event.name),
    removedPeriods: state.periods
      .filter(
        (period) => period.association.offers.length === 1 && period.association.offers[0] === id,
      )
      .map((period) => period.name ?? period.id),
  };
}

/**
 * Removes an offer of a draft with everything that is only its own: its stages and the dates
 * that reach only it, its periods, its intake and its admission destinations. A date of several
 * offers keeps the others, The calendar keeps at least one offer.
 */
export function removeOffer<S extends ActivityState>(
  state: S,
  id: string,
  institutional: InstitutionalEventSnapshot[],
): S {
  offerRemovalPreview(state, id);
  const periods = state.periods.flatMap((period) => {
    if (!period.association.offers.includes(id)) return [period];
    const offers = period.association.offers.filter((offer) => offer !== id);
    return offers.length ? [{ ...period, association: { ...period.association, offers } }] : [];
  });
  const events = state.events.flatMap((event) => {
    if (ownsDate(event, id)) return [];
    const next = event.offers.includes(id)
      ? { ...event, offers: event.offers.filter((o) => o !== id) }
      : event;
    const admission = next.notice?.admission;
    if (!admission?.destinations.some((destination) => destination.offerId === id)) return [next];
    return [
      {
        ...next,
        notice: {
          ...next.notice,
          admission: {
            ...admission,
            destinations: admission.destinations.filter((d) => d.offerId !== id),
          },
        },
      },
    ];
  });
  return recalculateCalendar(
    { ...state, offers: state.offers.filter((offer) => offer.id !== id), periods, events },
    institutional,
  );
}
