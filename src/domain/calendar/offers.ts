import { modalityIds, modalityLabels } from './config.ts';
import { DomainError } from '../errors.ts';
import type {
  CalendarOffer,
  CalendarContent,
  OfferKind,
  Organization,
  AcademicTerm,
  AssessmentSettings,
  PeriodAssociation,
} from './model.ts';
import type { StagePosition } from './activities/activity-ref.ts';

/** All live domain inputs carry explicit offers. */
export const calendarOffers = (state: AssessmentSettings): CalendarOffer[] => state.offers;

export const offerIds = (state: AssessmentSettings): string[] =>
  calendarOffers(state).map((offer) => offer.id);
export const offerFor = (state: AssessmentSettings, id: string): CalendarOffer | undefined =>
  calendarOffers(state).find((offer) => offer.id === id);
export const labelFor = (state: AssessmentSettings, id: string): string => {
  const offer = offerFor(state, id);
  return offer ? offerLabel(offer) : id;
};
export const associationOffers = (association: PeriodAssociation): string[] => association.offers;

export const kindOf = (offer: CalendarOffer): OfferKind => offer.kind;
export const levelOf = (offer: CalendarOffer): 'tecnico' | 'graduacao' | 'posgraduacao' =>
  offer.kind === 'integrado' || offer.kind === 'subsequente' ? 'tecnico' : offer.kind;
export const offerLabel = (offer: CalendarOffer): string =>
  offer.label?.trim() || modalityLabels[offer.kind];

/**
 * Norm an offer follows under a policy with scope (`CalendarPolicy.scope`): the campus answer when
 * given, otherwise the delivery mode, which already tells it apart: a presencial offer is covered,
 * an EaD one has its own regulation. Undefined while the delivery mode is `a-conferir`.
 */
export const scopeStatus = (
  offer: Pick<CalendarOffer, 'scope' | 'delivery'>,
): 'covered' | 'own-regulation' | undefined =>
  offer.scope?.status ??
  (offer.delivery === 'presencial'
    ? 'covered'
    : offer.delivery === 'ead'
      ? 'own-regulation'
      : undefined);

/** Stable order preserves the institutional base identity regardless of offer order. */
export function kinds(state: { offers: readonly CalendarOffer[] }): OfferKind[] {
  return modalityIds.filter((kind) => state.offers.some((offer) => offer.kind === kind));
}

export function organizationSummary(
  offers: readonly Pick<CalendarOffer, 'organization'>[],
): Organization | 'misto' | null {
  if (!offers.length) return null;
  return new Set(offers.map((offer) => offer.organization)).size === 1
    ? offers[0].organization
    : 'misto';
}

/** The annual persisted ordinal is kept while numbering restarts within each cycle. */
export function stageInTerm(n: number, perTerm: number): { term: number; number: number } {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(perTerm) || perTerm < 1)
    throw new DomainError('Etapa e quantidade por ciclo devem ser inteiros positivos.');
  const term = Math.ceil(n / perTerm);
  return { term, number: n - (term - 1) * perTerm };
}

/** Stages per cycle of the offer; undefined while the campus has not chosen them. */
export const stagesPerTerm = (offer: Pick<CalendarOffer, 'stages'>): number | undefined =>
  offer.stages?.perTerm;

export function stageTerm(offer: CalendarOffer, n: number): AcademicTerm | undefined {
  const perTerm = stagesPerTerm(offer);
  if (perTerm === undefined) return undefined;
  if (n < 1 || n > stageCount(offer) || !Number.isInteger(n)) return undefined;
  return offer.organization === 'anual'
    ? 'annual'
    : stageInTerm(n, perTerm).term === 1
      ? 'first'
      : 'second';
}

/**
 * Position of the offer's `n`-th stage (ordinal in the year) under its current organization: the
 * cycle and the number within it. Undefined when the offer has no such stage, because its number of
 * stages was not informed or `n` goes beyond it.
 */
export function stagePosition(offer: CalendarOffer, n: number): StagePosition | undefined {
  const term = stageTerm(offer, n);
  if (!term) return undefined;
  return {
    status: 'defined',
    term,
    number: offer.organization === 'semestral' ? stageInTerm(n, stagesPerTerm(offer)!).number : n,
  };
}

/**
 * Ordinal in the year of a stage position under the offer's current organization, the inverse of
 * `stagePosition`; undefined for a position the organization does not have, which includes every
 * position of an offer whose number of stages was not informed.
 */
export function stageOrdinal(offer: CalendarOffer, position: StagePosition): number | undefined {
  const perTerm = stagesPerTerm(offer);
  if (perTerm === undefined) return undefined;
  const ordinal = position.term === 'second' ? perTerm + position.number : position.number;
  const back = stagePosition(offer, ordinal);
  return back?.term === position.term && back.number === position.number ? ordinal : undefined;
}

export function stageCount(offer: CalendarOffer): number {
  const perTerm = stagesPerTerm(offer);
  if (perTerm === undefined) return 0;
  return perTerm * (offer.organization === 'semestral' ? 2 : 1);
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

/** References reserve identities even when the current form no longer contains the offer. */
export function nextOfferId(
  state: Pick<CalendarContent, 'offers' | 'periods' | 'events'>,
  kind: OfferKind,
): string {
  const used = new Set(state.offers.map((offer) => offer.id));
  for (const period of state.periods) for (const id of period.association.offers) used.add(id);
  for (const event of state.events) {
    for (const id of event.scope.offers) used.add(id);
    if (event.activity && 'offerId' in event.activity) used.add(event.activity.offerId);
  }
  if (!used.has(kind)) return kind;
  let n = 2;
  while (used.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}
