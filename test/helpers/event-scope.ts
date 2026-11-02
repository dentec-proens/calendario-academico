import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  projectDates,
  type CalendarContent,
  type CalendarOffer,
  type InstitutionalEventSnapshot,
  type TeachingState,
} from '../../src/domain/calendar/model.ts';
import { applyObservances } from '../../src/domain/calendar/observances.ts';
import type { CatalogueEvent } from '../../src/domain/institution/catalogue.ts';
import { readOracle, v4CatalogueRows, v4Cases, type V4Case } from './v4-fixtures.ts';
import { convertedCatalogueRow, convertedContent } from './v5-conversion.ts';

/**
 * Scope with confirmation (phase 2, step 7; plan, section 5.3). The frozen fixture “Acréscimo de
 * oferta materializa a abrangência” has explicit lists, materialized candidates and a list proven
 * by its submission; one v4 date without offers is added so that every form of scope is present
 * after the conversion. It is a note, so the count stays the one of the oracle.
 */
export const offerAdditionName = 'Acréscimo de oferta materializa a abrangência';

export const scopeForms = {
  'graduacao-stage-1': 'explicit',
  'integrado-stage-1': 'materialized-candidate',
  'campus-meeting': 'materialized-proven',
  'legacy-note': 'unconfirmed',
} as const;

export function offerAdditionCase(): V4Case {
  const item = structuredClone(v4Cases().find((entry) => entry.name === offerAdditionName)!);
  item.content.state.events.push({
    id: 'legacy-note',
    name: 'Reunião sem ofertas declaradas',
    start: '2027-05-03',
    end: '2027-05-03',
    kind: 'note',
    category: 'evento',
  });
  return item;
}

export type ScopeState = CalendarContent & TeachingState & { campus: string };

/** The case converted to format 5, as the domain reads it. */
export function offerAdditionState(item = offerAdditionCase()) {
  const content = convertedContent(item);
  return {
    state: { ...content.state, year: item.year, campus: item.campus } as unknown as ScopeState,
    snapshot: content.institutionalSnapshot as unknown as InstitutionalEventSnapshot[],
  };
}

/** The institutional catalogue of the frozen fixtures, converted, as the save boundary reads it. */
export function offerAdditionCatalogue(): (CatalogueEvent & Record<string, unknown>)[] {
  return v4CatalogueRows().map((row) => {
    const { code, year: _year, ...fields } = convertedCatalogueRow(row);
    return { id: code, ...fields } as unknown as CatalogueEvent & Record<string, unknown>;
  });
}

const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));

/** Count by offer in the notation of the v4 oracle (`v4-oracle.test.ts`). */
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

/** Count by offer recorded by the v4 code before phase 2 for the fixture. */
export function oracleCounting(): Record<string, unknown> {
  const oracle = readOracle<{ cases: { name: string; counting: Record<string, unknown> }[] }>();
  return oracle.cases.find((entry) => entry.name === offerAdditionName)!.counting;
}

/** Offer added to the fixture, with no date of its own before its organization is applied. */
export const newOffer: CalendarOffer = {
  id: 'subsequente',
  kind: 'subsequente',
  delivery: 'a-conferir',
  organization: 'a-classificar',
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
