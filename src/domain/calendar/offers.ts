import { modalityIds, modalityLabels } from './config.ts';
import { DomainError } from '../errors.ts';
import type {
  CalendarOffer,
  CalendarContentV4,
  OfferKind,
  Organization,
  AcademicTerm,
  AssessmentSettings,
  PeriodAssociation,
} from './model.ts';

/** Transitional input boundary; v4 offers always take precedence over v3 summaries. */
export function calendarOffers(state: AssessmentSettings): CalendarOffer[] {
  if (state.offers) return state.offers;
  return (state.modalities ?? []).map((id) => {
    const kind = modalityIds.find((value) => value === id);
    if (!kind) throw new DomainError('Tipo de oferta inválido.');
    const organization =
      state.organizationByModality?.[id] ??
      (state.schemaVersion === 3
        ? 'a-classificar'
        : state.regime === 'anual' || state.regime === 'semestral'
          ? state.regime
          : 'a-classificar');
    const count = state.assessmentStagesByModality?.[id];
    return {
      id,
      kind,
      delivery: 'a-conferir',
      organization,
      ...(count === undefined
        ? {}
        : { stages: { perTerm: count / (organization === 'semestral' ? 2 : 1) } }),
      ...(state.scopeConfirmation ? { scope: state.scopeConfirmation } : {}),
      ...(state.intakeByModality?.[id] ? { intake: state.intakeByModality[id] } : {}),
    };
  });
}

export const offerIds = (state: AssessmentSettings): string[] =>
  calendarOffers(state).map((offer) => offer.id);
export const offerFor = (state: AssessmentSettings, id: string): CalendarOffer | undefined =>
  calendarOffers(state).find((offer) => offer.id === id);
export const labelFor = (state: AssessmentSettings, id: string): string => {
  const offer = offerFor(state, id);
  return offer ? offerLabel(offer) : id;
};
export const associationOffers = (association?: PeriodAssociation): string[] =>
  association?.status === 'defined'
    ? 'offers' in association
      ? association.offers
      : association.modalities
    : [];
export const isStructured = (state: AssessmentSettings): boolean =>
  state.schemaVersion === 3 || state.schemaVersion === 4;

export const kindOf = (offer: CalendarOffer): OfferKind => offer.kind;
export const levelOf = (offer: CalendarOffer): 'tecnico' | 'graduacao' | 'posgraduacao' =>
  offer.kind === 'integrado' || offer.kind === 'subsequente' ? 'tecnico' : offer.kind;
export const offerLabel = (offer: CalendarOffer): string =>
  offer.label?.trim() || modalityLabels[offer.kind];

/** Stable order preserves the institutional base identity regardless of offer order. */
export function kinds(state: { offers: readonly CalendarOffer[] }): OfferKind[] {
  return modalityIds.filter((kind) => state.offers.some((offer) => offer.kind === kind));
}

export function organizationSummary(
  offers: readonly Pick<CalendarOffer, 'organization'>[],
): Organization | 'misto' {
  const values = new Set(offers.map((offer) => offer.organization));
  if (!offers.length || values.has('a-classificar')) return 'a-classificar';
  return values.size === 1 ? offers[0].organization : 'misto';
}

/** The annual persisted ordinal is kept while numbering restarts within each cycle. */
export function stageInTerm(n: number, perTerm: number): { term: number; number: number } {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(perTerm) || perTerm < 1)
    throw new DomainError('Etapa e quantidade por ciclo devem ser inteiros positivos.');
  const term = Math.ceil(n / perTerm);
  return { term, number: n - (term - 1) * perTerm };
}

export function stageTerm(offer: CalendarOffer, n: number): AcademicTerm | undefined {
  if (!offer.stages || offer.organization === 'a-classificar') return undefined;
  if (n < 1 || n > stageCount(offer) || !Number.isInteger(n)) return undefined;
  return offer.organization === 'anual'
    ? 'annual'
    : stageInTerm(n, offer.stages.perTerm).term === 1
      ? 'first'
      : 'second';
}

export function stageCount(offer: CalendarOffer): number {
  if (offer.organization === 'a-classificar') return offer.legacyStageCount ?? 0;
  if (!offer.stages) return 0;
  return offer.stages.perTerm * (offer.organization === 'semestral' ? 2 : 1);
}

export function stageCycle(offer: CalendarOffer): string | undefined {
  const total = stageCount(offer);
  return total === 2
    ? 'semestral'
    : total === 3
      ? 'trimestral'
      : total === 4
        ? 'bimestral'
        : undefined;
}

/** Informational legacy summary; requirements still inspect each offer's explicit intake. */
export function secondSemesterIntake(offers: readonly CalendarOffer[]): boolean | undefined {
  if (offers.some((offer) => offer.intake?.second?.status === 'yes')) return true;
  return offers.length && offers.every((offer) => offer.intake?.second?.status === 'no')
    ? false
    : undefined;
}

/** References reserve identities even when the current form no longer contains the offer. */
export function nextOfferId(
  state: Pick<CalendarContentV4, 'offers' | 'periods' | 'events'>,
  kind: OfferKind,
): string {
  const used = new Set(state.offers.map((offer) => offer.id));
  for (const period of state.periods)
    if (period.association.status === 'defined')
      for (const id of period.association.offers) used.add(id);
  for (const event of state.events) {
    for (const id of event.offers ?? []) used.add(id);
    const suffix = event.requirementId?.split(':').at(1);
    if (suffix) used.add(suffix);
  }
  if (!used.has(kind)) return kind;
  let n = 2;
  while (used.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}
