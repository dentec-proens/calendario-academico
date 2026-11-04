import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  type NewOffer,
} from '../../src/domain/calendar/organization/offers.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  projectDates,
  type CalendarContent,
  type InstitutionalEventSnapshot,
  type TeachingState,
} from '../../src/domain/calendar/model.ts';
import { applyObservances } from '../../src/domain/calendar/observances.ts';
import type { CatalogueEvent } from '../../src/domain/institution/catalogue.ts';
import { storedCases, storedCatalogueRows, type StoredCase } from './stored-fixtures.ts';

/**
 * Offers a date lists. The stored fixture “Acréscimo de oferta materializa a abrangência” has
 * stages of one offer, a date of two and, added here, a note that lists every offer of the
 * calendar. It is a note, so the count is unchanged.
 */
export const offerAdditionName = 'Acréscimo de oferta materializa a abrangência';

export const listForms = {
  'graduacao-stage-1': 'one offer',
  'integrado-stage-1': 'one offer',
  'campus-meeting': 'two offers',
  'all-offers-note': 'every offer',
} as const;

export function offerAdditionCase(): StoredCase {
  const item = structuredClone(storedCases().find((entry) => entry.name === offerAdditionName)!);
  item.content.state.events.push({
    id: 'all-offers-note',
    name: 'Reunião de todas as ofertas',
    start: '2027-05-03',
    end: '2027-05-03',
    effect: 'note',
    category: 'evento',
    offers: ['integrado', 'graduacao', 'graduacao-2', 'graduacao-3'],
  });
  return item;
}

export type ScopeState = CalendarContent & TeachingState & { campus: string };

/** The stored case, as the domain reads it. */
export function offerAdditionState(item = offerAdditionCase()) {
  const content = item.content;
  return {
    state: { ...content.state, year: item.year, campus: item.campus } as unknown as ScopeState,
    snapshot: content.institutionalSnapshot as unknown as InstitutionalEventSnapshot[],
  };
}

/** The institutional catalogue of the stored fixtures, as the save boundary reads it. */
export function offerAdditionCatalogue(): (CatalogueEvent & Record<string, unknown>)[] {
  return storedCatalogueRows().map((row) => {
    const { code, year: _year, ...fields } = row;
    return { id: code, ...fields } as unknown as CatalogueEvent & Record<string, unknown>;
  });
}

const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));

/** Count by offer, with the ledger as a fingerprint. */
export function countingOf(
  state: ScopeState,
  snapshot: InstitutionalEventSnapshot[],
  offers: readonly string[],
) {
  const events = projectDates(applyObservances(snapshot, state), state.events);
  const evaluation = evaluateCalendar(state, events);
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        offers.map((offerId) => {
          const { ledger, ...count } = evaluation.byOffer[offerId];
          return [offerId, { ...count, ledgerSha256: hash(JSON.stringify(ledger)) }];
        }),
      ),
    ),
  ) as Record<string, unknown>;
}

/** Count by offer of the stored fixture, before any change, over its own offers. */
export function offerAdditionCounting(): Record<string, unknown> {
  const { state, snapshot } = offerAdditionState();
  return countingOf(
    state,
    snapshot,
    state.offers.map((offer) => offer.id),
  );
}

/** Offer added to the fixture, with no date of its own before its organization is applied. */
export const newOffer: NewOffer = {
  id: 'subsequente',
  kind: 'subsequente',
  delivery: 'a-conferir',
};

/** The new offer with its complete annual organization, as the Periods step applies it. */
export function withNewOffer<S extends ScopeState>(state: S): S {
  const draft = offerOrganizationDraft(state, newOffer.id);
  draft.organization = 'anual';
  draft.count = '2';
  Object.assign(draft.periods[0], {
    name: 'Ano letivo do subsequente',
    start: civilDate('2027-02-01'),
    end: civilDate('2027-12-17'),
  });
  Object.assign(draft.stages[0], { start: civilDate('2027-02-01'), end: civilDate('2027-06-30') });
  Object.assign(draft.stages[1], { start: civilDate('2027-07-01'), end: civilDate('2027-12-17') });
  let sequence = 0;
  return applyOfferOrganization(state, newOffer.id, draft, () => `new-${++sequence}`, newOffer);
}
