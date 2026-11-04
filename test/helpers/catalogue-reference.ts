import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  ActivityPlanItem,
  AssessmentSettings,
  CalendarOffer,
} from '../../src/domain/calendar/model.ts';
import { calendarOffers } from '../../src/domain/calendar/offers.ts';
import { modalityIds } from '../../src/domain/calendar/config.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import type { CalendarPolicy } from '../../src/domain/policies/contract.ts';

/**
 * Reference configurations of the expanded catalogue: the fingerprint of the current version and
 * the expected catalogue (`test/fixtures/catalogue-expected.json`) are computed over them.
 * Changing them recomputes both, so do it alone, with the rules unchanged.
 */
type Settings = Omit<AssessmentSettings, 'year'>;

const offerOf = (
  kind: CalendarOffer['kind'],
  delivery: CalendarOffer['delivery'],
  organization: CalendarOffer['organization'],
  perTerm?: number,
  extra: Pick<CalendarOffer, 'scope' | 'intake'> = {},
): CalendarOffer => ({
  id: kind,
  kind,
  delivery,
  organization,
  ...(perTerm ? { stages: { status: 'defined', perTerm } } : {}),
  ...extra,
});

/**
 * The norm an offer follows comes from its delivery mode when the campus gave no `scope`:
 * presencial offers are covered and EaD ones have their own regulation, which changes
 * applicability, window and minimums. Intake variants cover each cycle and combination a campus can
 * require by a local rule.
 */
export const referenceSettings: Settings[] = [
  // Delivery mode to confirm, with the campus answer on the scope.
  { offers: [offerOf('integrado', 'a-conferir', 'anual', 4, { scope: { status: 'covered' } })] },
  {
    offers: [
      offerOf('subsequente', 'a-conferir', 'anual', 2, { scope: { status: 'covered' } }),
      offerOf('graduacao', 'a-conferir', 'semestral', 1, {
        scope: { status: 'covered' },
        intake: { first: true },
      }),
    ],
  },
  // Delivery mode to confirm, without an answer on the scope.
  {
    offers: [
      offerOf('integrado', 'a-conferir', 'anual', 3),
      offerOf('subsequente', 'a-conferir', 'semestral', 1),
      offerOf('graduacao', 'a-conferir', 'semestral', 1),
      offerOf('posgraduacao', 'a-conferir', 'semestral', 1),
    ],
  },
  {
    offers: [
      offerOf('graduacao', 'a-conferir', 'semestral', 1, { scope: { status: 'own-regulation' } }),
    ],
  },
  {
    offers: [
      offerOf('integrado', 'a-conferir', 'anual', 4),
      offerOf('subsequente', 'a-conferir', 'anual'),
    ],
  },
  // Delivery mode known, without `scope`.
  {
    offers: [
      offerOf('integrado', 'presencial', 'anual', 4),
      offerOf('subsequente', 'presencial', 'semestral', 2),
      offerOf('graduacao', 'presencial', 'semestral', 1),
      offerOf('posgraduacao', 'presencial', 'semestral', 1),
    ],
  },
  {
    offers: [
      offerOf('integrado', 'ead', 'anual', 4),
      offerOf('subsequente', 'ead', 'semestral', 2),
      offerOf('graduacao', 'ead', 'semestral', 1),
      offerOf('posgraduacao', 'ead', 'semestral', 1),
    ],
  },
  {
    offers: [
      offerOf('integrado', 'presencial', 'anual', 3),
      offerOf('subsequente', 'ead', 'anual', 2),
      offerOf('graduacao', 'presencial', 'semestral', 2),
      offerOf('posgraduacao', 'ead', 'semestral', 1),
    ],
  },
  // Intake required by a local rule, in each cycle and combination.
  {
    offers: [
      offerOf('integrado', 'presencial', 'anual', 4, { intake: { annual: true } }),
      offerOf('subsequente', 'presencial', 'semestral', 2, { intake: { first: true } }),
      offerOf('graduacao', 'presencial', 'semestral', 1, { intake: { first: true, second: true } }),
      offerOf('posgraduacao', 'presencial', 'semestral', 1, { intake: { second: true } }),
    ],
  },
  {
    offers: [
      offerOf('integrado', 'ead', 'anual', 4, { intake: { annual: true } }),
      offerOf('graduacao', 'presencial', 'semestral', 1, { intake: { second: true } }),
    ],
  },
];

/**
 * Requirement fields left out of the hash because they act only through `byModality`, and the
 * row's link (`activity`), which is derived from the ID and the slot already in the fingerprint
 * and carries no normative content. Every other field, including fields added later, is part of
 * the fingerprint.
 */
const hidden = new Set<string>([
  'required',
  'applicability',
  'optionalFor',
  'activity',
] satisfies (keyof ActivityPlanItem)[]);

const note = (policy: CalendarPolicy, requirement: ActivityPlanItem, offer: CalendarOffer) =>
  policy.applicabilityNote?.(requirement, offer) ?? null;

/** What a policy generates for one configuration. */
export function catalogueState(policy: CalendarPolicy, year: number, settings: Settings) {
  const state = { ...settings, year };
  return {
    window: policy.window(state),
    requirements: activityPlan(state).map((requirement) => ({
      ...Object.fromEntries(Object.entries(requirement).filter(([key]) => !hidden.has(key))),
      byModality: Object.fromEntries(
        calendarOffers(state).map((offer) => [
          offer.id,
          {
            applicability: policy.applicability(state, requirement, offer),
            note: note(policy, requirement, offer),
            minimums: (() => {
              const minimums = policy.countingMinimums(state, offer);
              return {
                annual: minimums.annual?.days ?? null,
                semester: minimums.semester?.days ?? null,
              };
            })(),
          },
        ]),
      ),
    })),
  };
}

/** The expanded catalogue of a policy over every reference configuration. */
export function catalogue(policy: CalendarPolicy, year: number) {
  return {
    criteria: policy.review.criteria,
    excludedModalities: calendarOffers({
      offers: modalityIds.map((kind) => ({
        id: kind,
        kind,
        delivery: 'a-conferir',
        organization: 'anual',
      })),
    })
      .filter((offer) => policy.excludes(offer))
      .map((offer) => offer.id),
    states: referenceSettings.map((settings) => catalogueState(policy, year, settings)),
  };
}

/** JSON with sorted keys and without undefined values, so field order never changes the hash. */
export const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;

export const fingerprint = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(value)))));

/** What the fixture records for a year: the catalogue, with the offers each state was computed on. */
export function expectedCatalogue(policy: CalendarPolicy, year: number) {
  const { states, ...rest } = catalogue(policy, year);
  return canonical({
    ...rest,
    states: states.map((state, index) => ({
      offers: referenceSettings[index].offers,
      ...state,
    })),
  }) as ExpectedCatalogue;
}

export interface ExpectedCatalogue {
  criteria: object[];
  excludedModalities: string[];
  states: {
    offers: object[];
    window: object | null;
    requirements: { id: string }[];
  }[];
}

export type ExpectedCatalogues = Record<string, ExpectedCatalogue>;

/**
 * The fixture as text: one line per criterion, offer and requirement row, so a change in the rules
 * shows in review as the rows that changed, state by state.
 */
export function formatExpected(catalogues: ExpectedCatalogues): string {
  const one = (value: unknown) => JSON.stringify(value);
  const list = (items: readonly unknown[], indent: string) =>
    items.length
      ? `[\n${items.map((item) => `${indent}  ${one(item)}`).join(',\n')}\n${indent}]`
      : '[]';
  const years = Object.entries(catalogues).map(([year, value]) => {
    const states = value.states.map(
      (state) =>
        `      {\n        "offers": ${list(state.offers, '        ')},\n        "window": ${one(state.window)},\n        "requirements": ${list(state.requirements, '        ')}\n      }`,
    );
    return `  ${one(year)}: {\n    "criteria": ${list(value.criteria, '    ')},\n    "excludedModalities": ${one(value.excludedModalities)},\n    "states": [\n${states.join(',\n')}\n    ]\n  }`;
  });
  return `{\n${years.join(',\n')}\n}\n`;
}
