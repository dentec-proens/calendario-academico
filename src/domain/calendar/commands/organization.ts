import type {
  ActivityState,
  CalendarActivity,
  CalendarOffer,
  Organization,
  AcademicTerm,
} from '../model.ts';
import { organizationSummary, organizationForModality } from '../organization/periods.ts';
import { activityChecklist } from '../activities/checklist.ts';
import { associationOffers, offerFor, offerIds } from '../offers.ts';
import { recalculateCalendar } from './recalculate.ts';
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
    organizationForModality(state, modality) !== (term === 'annual' ? 'anual' : 'semestral')
  )
    throw new DomainError('O ciclo da oferta mudou. Reabra a atividade de matrícula.');
  const offer = offerFor(state, modality);
  const current = state.offers ? offer?.intake?.[term] : state.intakeByModality?.[modality]?.[term];
  const configuration = {
    ...current,
    status: required ? ('yes' as const) : (current?.status ?? 'unknown'),
    required,
  };
  if (state.offers)
    return {
      ...state,
      offers: state.offers.map((item) =>
        item.id === modality
          ? { ...item, intake: { ...item.intake, [term]: configuration } }
          : item,
      ),
    };
  return {
    ...state,
    intakeByModality: {
      ...state.intakeByModality,
      [modality]: {
        ...state.intakeByModality?.[modality],
        [term]: configuration,
      },
    },
  };
}

export function configureAssessment<S extends ActivityState>(
  state: S,
  values: Record<string, string>,
  institutional: CalendarActivity[],
): S {
  const stages: Record<string, number> = {};
  for (const modality of offerIds(state)) {
    const value = values[modality];
    if (!value) continue;
    const count = Number(value);
    const allowed =
      state.offers && organizationForModality(state, modality) === 'semestral' ? [1, 2] : [2, 3, 4];
    if (
      !allowed.includes(count) ||
      (state.offers && organizationForModality(state, modality) === 'a-classificar')
    )
      throw new DomainError('Selecione o número de etapas permitido para o ciclo da oferta.');
    stages[modality] = count;
  }
  const next = state.offers
    ? {
        ...state,
        offers: state.offers.map(({ stages: _stages, ...offer }) => ({
          ...offer,
          ...(stages[offer.id] === undefined ? {} : { stages: { perTerm: stages[offer.id] } }),
        })),
      }
    : { ...state, assessmentStagesByModality: stages };
  const valid = new Set(activityChecklist(next).map((item) => item.id));
  return recalculateCalendar(
    {
      ...next,
      events: state.events.map((event) => {
        if (!event.requirementId || valid.has(event.requirementId)) return event;
        const { requirementId: _requirement, assessmentAutoStart: _anchor, ...rest } = event;
        return rest;
      }),
    },
    institutional,
  );
}

/** Classifying organization never guesses which legacy period belongs to which offer. */
export function configureOrganization<S extends ActivityState>(
  state: S,
  organizationByModality: Record<string, Organization>,
  institutional: CalendarActivity[],
): S {
  const modalities = offerIds(state);
  if (
    Object.keys(organizationByModality).some((m) => !modalities.includes(m)) ||
    modalities.some(
      (m) => !['anual', 'semestral', 'a-classificar'].includes(organizationByModality[m]),
    )
  )
    throw new DomainError('Informe a organização de cada oferta.');
  const periods = state.periods.map((p) =>
    p.association?.status === 'defined' &&
    associationOffers(p.association).every(
      (m) =>
        organizationByModality[m] ===
        (p.association?.status === 'defined' && p.association.term === 'annual'
          ? 'anual'
          : 'semestral'),
    )
      ? p
      : { ...p, association: { status: 'a-classificar' as const } },
  );
  if (state.offers) {
    for (const offer of state.offers) {
      const organization = organizationByModality[offer.id];
      if (organization === offer.organization) continue;
      if (
        Object.entries(offer.intake ?? {}).some(
          ([term, entry]) => entry.required && (term === 'annual') !== (organization === 'anual'),
        )
      )
        throw new DomainError(
          'Revise a exigência local de matrícula antes de alterar a organização da oferta.',
        );
      if (
        offer.stages &&
        !(
          organization === 'semestral' ? [1, 2] : organization === 'anual' ? [2, 3, 4] : []
        ).includes(offer.stages.perTerm)
      )
        throw new DomainError(
          'Revise as etapas de avaliação antes de alterar a organização da oferta.',
        );
    }
    return recalculateCalendar(
      {
        ...state,
        offers: state.offers.map((offer) => ({
          ...offer,
          organization: organizationByModality[offer.id],
        })),
        periods,
      },
      institutional,
    );
  }
  return recalculateCalendar(
    {
      ...state,
      schemaVersion: 3,
      organizationByModality: { ...organizationByModality },
      regime: organizationSummary(organizationByModality, modalities),
      periods,
      conversion: state.conversion
        ? {
            ...state.conversion,
            organization:
              periods.every((p) => p.association?.status === 'defined') &&
              modalities.every((m) => organizationByModality[m] !== 'a-classificar')
                ? 'classified'
                : 'pending',
          }
        : undefined,
    },
    institutional,
  );
}
