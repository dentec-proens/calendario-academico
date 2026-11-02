import type { ActivityState, CalendarOffer, AcademicTerm } from '../model.ts';
import { organizationForOffer } from '../organization/periods.ts';
import { offerFor, offerIds } from '../offers.ts';
import { DomainError } from '../../errors.ts';
import { validateOffers } from '../normalization/normalize-v4.ts';

/** Editable metadata never changes an offer's identity, type, periods or assessment records. */
export function configureOfferMetadata<S extends ActivityState & { offers: CalendarOffer[] }>(
  state: S,
  id: string,
  metadata: Pick<CalendarOffer, 'label' | 'delivery' | 'organizationBasis'>,
): S {
  if (!state.offers.some((offer) => offer.id === id))
    throw new DomainError('A oferta não pertence ao calendário.');
  if (!['presencial', 'ead', 'a-conferir'].includes(metadata.delivery))
    throw new DomainError('Selecione o modo de oferta.');
  const offers = validateOffers(
    state.offers.map((offer) => {
      if (offer.id !== id) return offer;
      const { label: _label, organizationBasis: _basis, ...kept } = offer;
      const label = metadata.label?.trim();
      const basis = metadata.organizationBasis?.trim();
      return {
        ...kept,
        delivery: metadata.delivery,
        ...(label ? { label } : {}),
        ...(basis ? { organizationBasis: basis } : {}),
      };
    }),
  );
  return { ...state, offers };
}

/** Change only the selected offer/cycle; existing intake declarations stay intact. */
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
  const offer = offerFor(state, modality);
  const current = offer?.intake?.[term];
  const configuration = {
    ...current,
    status: required ? ('yes' as const) : (current?.status ?? 'unknown'),
    required,
  };
  return {
    ...state,
    offers: state.offers.map((item) =>
      item.id === modality ? { ...item, intake: { ...item.intake, [term]: configuration } } : item,
    ),
  };
}
