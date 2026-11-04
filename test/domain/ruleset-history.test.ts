import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
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
import type { CalendarPolicy, RulesetChange } from '../../src/domain/policies/contract.ts';
import {
  activityIds,
  type ActivityBase,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { operationalRules } from '../../src/domain/calendar/activities/operational-checklist.ts';
import {
  activityBases,
  pairsOf,
  released2027,
  releasedGlobal,
  releasedOperational,
  type ReleasedActivities,
} from '../helpers/released-activities.ts';
import {
  declaredActivityRules,
  equivalentRulesets,
  policyFor,
  reviewBoundary,
  rulesetChangesBetween,
} from '../../src/domain/policies/registry.ts';
import { legacyIds } from '../helpers/legacy-classification.ts';
import { withDeclaredCategories } from '../helpers/declared-categories.ts';
import { withSplitWithdrawal } from '../helpers/split-withdrawal.ts';
import { withOptionalNotice } from '../helpers/optional-notice.ts';

/**
 * Catalogue fingerprint of each policy version. When this test fails on a bound policy, append a
 * version to its `rulesetChanges`, classify its effect and record the new version's fingerprint
 * here; never edit the fingerprint of a released version. Retired policies retain their published
 * fingerprints only in the archive checks. Changing `hidden` or `referenceSettings` recomputes
 * every runtime fingerprint, so do it alone, with the rules unchanged.
 */
const catalogueFingerprints: Record<string, string> = {
  'legacy-2026-v1': 'b0e948ba297029f2f001473bd645baab6ed4f4a44c793835c9b3d0d6286a32df',
  'consup-292-2027-v2': 'bc56d935878de0a5af2150b3c0fbdb4575d74db77afc0e8f143e4318f31e1e8d',
  'consup-292-2027-v3': 'bc56d935878de0a5af2150b3c0fbdb4575d74db77afc0e8f143e4318f31e1e8d',
  'unconfigured:2028': '85a305ec506d13408190b3ec133c33b76ae7518951b8325ed3edc82f8a666d32',
};

/**
 * Captured from release A before removing its compatibility paths. Historical
 * cases 3 and 5 deliberately had contradictory global/offer organizations.
 * The archive preserves their released hashes; the independent v4 capture
 * compares this implementation with release A using only explicit offers.
 */
const archive = JSON.parse(
  readFileSync(new URL('../fixtures/ruleset-release-a-catalogues.json', import.meta.url), 'utf8'),
) as {
  sourceSha256: string;
  historicalCatalogues: Record<string, unknown>;
  v4Settings: Omit<AssessmentSettings, 'year'>[];
  v4Catalogues: Record<string, unknown>;
};
/**
 * The archive keeps the v4 offer stages and intake configuration; the code reads
 * `{ status: 'defined', perTerm }` and only the cycles with a local requirement.
 */
const archiveSettings = archive.v4Settings.map((settings) => ({
  ...settings,
  offers: settings.offers.map((offer) => {
    const { stages, intake, ...rest } = offer as Omit<CalendarOffer, 'stages' | 'intake'> & {
      stages?: { perTerm: number };
      intake?: Record<string, { required?: boolean }>;
    };
    const required = Object.entries(intake ?? {}).filter(([, value]) => value.required === true);
    return {
      ...rest,
      ...(stages ? { stages: { status: 'defined' as const, perTerm: stages.perTerm } } : {}),
      ...(required.length
        ? { intake: Object.fromEntries(required.map(([term]) => [term, true as const])) }
        : {}),
    };
  }),
}));

const offerOf = (
  kind: CalendarOffer['kind'],
  delivery: CalendarOffer['delivery'],
  organization: CalendarOffer['organization'],
  perTerm: number,
  intake?: CalendarOffer['intake'],
): CalendarOffer => ({
  id: kind,
  kind,
  delivery,
  organization,
  stages: { status: 'defined', perTerm },
  ...(intake ? { intake } : {}),
});

/**
 * Configurations the archive never had. The norm an offer follows comes from its delivery mode
 * when the campus gave no `scope`, which the archive's settings always spelled out or left at
 * `a-conferir`: presencial offers are covered and EaD ones have their own regulation, which
 * changes applicability, window and minimums. Intake variants cover each cycle and combination a
 * campus can require by a local rule.
 */
const addedSettings: Omit<AssessmentSettings, 'year'>[] = [
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
  {
    offers: [
      offerOf('integrado', 'presencial', 'anual', 4, { annual: true }),
      offerOf('subsequente', 'presencial', 'semestral', 2, { first: true }),
      offerOf('graduacao', 'presencial', 'semestral', 1, { first: true, second: true }),
      offerOf('posgraduacao', 'presencial', 'semestral', 1, { second: true }),
    ],
  },
  {
    offers: [
      offerOf('integrado', 'ead', 'anual', 4, { annual: true }),
      offerOf('graduacao', 'presencial', 'semestral', 1, { second: true }),
    ],
  },
];

const referenceSettings = [...archiveSettings, ...addedSettings];

/**
 * Requirement fields left out of the hash because they act only through `byModality`, and the
 * row's link (`activity`), which is derived from the ID and the slot already
 * in the fingerprint and carries no normative content. Every other field, including fields
 * added later, is part of the fingerprint.
 */
const hidden = new Set<string>([
  'required',
  'applicability',
  'optionalFor',
  'activity',
] satisfies (keyof ActivityPlanItem)[]);

const note = (policy: CalendarPolicy, requirement: ActivityPlanItem, offer: CalendarOffer) =>
  policy.applicabilityNote?.(requirement, offer) ?? null;

function catalogue(
  policy: CalendarPolicy,
  year: number,
  settingsList: readonly Omit<AssessmentSettings, 'year'>[] = referenceSettings,
) {
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
    states: settingsList.map((settings) => {
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
    }),
  };
}

/** JSON with sorted keys and without undefined values, so field order never changes the hash. */
const canonical = (value: unknown): unknown =>
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

const fingerprint = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(value)))));

const years = [2027, 2028];
const boundPolicies = years.map(policyFor).filter((policy) => policy.rulesetPrefix);
const versionOf = (policy: CalendarPolicy, year: number) =>
  policy.rulesetVersion({
    year,
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  });

test('every bound ruleset has an ordered history ending at the current version', () => {
  expect(boundPolicies.length).toBeGreaterThan(0);
  for (const policy of boundPolicies) {
    expect(policy.catalogue?.length).toBeGreaterThan(0);
    const changes = policy.rulesetChanges ?? [];
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].effect).toBe('establishes');
    expect(new Set(changes.map((change) => change.version)).size).toBe(changes.length);
    const criteria = new Set(policy.review.criteria.map((criterion) => criterion.id));
    for (const [index, change] of changes.entries()) {
      expect(change.version.startsWith(policy.rulesetPrefix!)).toBe(true);
      expect(change.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (index) expect(change.date >= changes[index - 1].date).toBe(true);
      expect(change.source.trim() && change.summary.trim()).toBeTruthy();
      for (const id of change.criteria ?? []) expect(criteria.has(id)).toBe(true);
    }
    expect(versionOf(policy, policy.year!)).toBe(changes.at(-1)!.version);
  }
});

/**
 * Saved dates link to a declaration (ID and repetition base), and normalization rejects a link no
 * catalogue declares, so released pairs are never retired. They are protected at two levels: per
 * catalogue, so that dropping a pair from one catalogue fails even when another still declares it
 * (the 2027 policy and the operational catalogue repeat some activities by different bases), and
 * in the global set that `activityIds()` reads, which is what keeps a stored link readable.
 */
const declaredBy = (rules: readonly { id: string; repeat: ActivityBase }[]): ReleasedActivities => {
  const of = (base: ActivityBase) => [
    ...new Set(rules.filter((rule) => rule.repeat === base).map((rule) => rule.id)),
  ];
  return { once: of('once'), cycle: of('cycle'), semester: of('semester'), stage: of('stage') };
};

const protectedCatalogue = (
  name: string,
  declared: ReleasedActivities,
  released: ReleasedActivities,
) => {
  expect(
    pairsOf(released).filter((pair) => !pairsOf(declared).includes(pair)),
    `${name}: uma atividade publicada saiu do catálogo e invalidaria calendários que a vinculam. Mantenha a linha, por exemplo opcional com optionalFor.`,
  ).toEqual([]);
  expect(
    pairsOf(declared).filter((pair) => !pairsOf(released).includes(pair)),
    `${name}: registre a nova atividade em test/helpers/released-activities.ts.`,
  ).toEqual([]);
};

test('released activities stay declared by the 2027 policy, pair by pair', () => {
  const policy = policyFor(2027);
  expect(policy.rulesetPrefix).toBeDefined();
  protectedCatalogue('consup-292-2027', declaredBy(policy.catalogue!), released2027);
});

test('released activities stay declared by the operational catalogue, pair by pair', () => {
  protectedCatalogue('catálogo operacional', declaredBy(operationalRules()), releasedOperational);
});

test('the global set of declarations keeps every released pair readable and holds nothing else', () => {
  const global = declaredBy(declaredActivityRules());
  for (const base of activityBases)
    expect([...activityIds(base)].sort(), base).toEqual([...global[base]].sort());
  protectedCatalogue('conjunto global', global, releasedGlobal);
  // Every catalogue's pairs belong to the global set, so no catalogue publishes outside it.
  for (const catalogue of [released2027, releasedOperational])
    expect(pairsOf(catalogue).filter((pair) => !pairsOf(releasedGlobal).includes(pair))).toEqual(
      [],
    );
});

test('published historical fingerprints remain intact and v4 catalogues match the independent release A capture', () => {
  expect(archive.sourceSha256).toBe(
    '32009116a85436005331f9dfe4a82f32c37f83865af6781ec63d174c7dda369c',
  );
  for (const [version, expected] of Object.entries(catalogueFingerprints)) {
    const year =
      version === 'legacy-2026-v1' ? 2026 : version.startsWith('consup-292-2027') ? 2027 : 2028;
    expect(fingerprint(archive.historicalCatalogues[year]), version).toBe(expected);
  }
  for (const year of years)
    expect(canonical(catalogue(policyFor(year), year, archiveSettings)), String(year)).toEqual(
      canonical(withCapturedCategories(withoutLegacyRows(archive.v4Catalogues[year]), year)),
    );
});

/**
 * Fingerprint of the expanded catalogue of the current version, over every reference
 * configuration (`referenceSettings`), checked apart from the historical archive above.
 *
 * In the hash: the review criteria; the offers each policy excludes; and, for each configuration,
 * the window, the minimums per offer and every expanded row with all its fields (name, basis,
 * decision, criterion, term, cycles, deadline, group, category, variant, instruction, and the like)
 * and, per offer, its applicability, applicability note and counting minimums.
 *
 * Not in the hash: `required`, `applicability`, `optionalFor` and the `activity` link of the row,
 * whose effect `byModality` already carries; the observances and art. 5º classification, which
 * have their own fingerprints; and the review's `source`, `evidence` and `dayMinimums`, the policy
 * `scope` declaration and the notices, which carry text or help that does not change what the
 * calendar must satisfy. A change to any of those is a new ruleset version only through the
 * channel that fingerprints it.
 */
const currentFingerprints: Record<string, string> = {
  'consup-292-2027-v8': 'a3c86fac6b3ee258649f8fa80b288c569305b0cf1ff6569616b5d2c15b13c904',
};

test('the expanded catalogue of the current version keeps its fingerprint', () => {
  expect(boundPolicies.length).toBeGreaterThan(0);
  for (const policy of boundPolicies) {
    const version = versionOf(policy, policy.year!);
    expect(Object.keys(currentFingerprints), 'Registre a impressão da versão corrente.').toContain(
      version,
    );
    expect(fingerprint(catalogue(policy, policy.year!)), version).toBe(
      currentFingerprints[version],
    );
  }
});

/**
 * consup-292-2027-v6 declares default categories (only `defaultCategory` of those rows differs,
 * in 2027), v7 splits the art. 11, VII, deadline, also in the operational catalogue, and v8 makes
 * the transfer notice optional (2027).
 */
function withCapturedCategories(captured: unknown, year: number) {
  const value = captured as { states: { requirements: { id: string }[] }[] };
  return {
    ...value,
    states: value.states.map((state) => ({
      ...state,
      requirements: withSplitWithdrawal(
        year === 2027
          ? withOptionalNotice(withDeclaredCategories(state.requirements), { optionalFor: false })
          : state.requirements,
      ),
    })),
  };
}

/**
 * 2027 no longer generates the optional rows the capture kept from the operational catalogue as
 * “Classificação legada”. They never carried an obligation (`optional`, or `unconfigured` for
 * excluded offers; outside the policy's declarations and `/regras`), so the ruleset version is kept
 * and the capture is compared without them; every other row is compared in full.
 */
function withoutLegacyRows(captured: unknown) {
  const value = captured as { states: { requirements: { id: string; basis?: string }[] }[] };
  return {
    ...value,
    states: value.states.map((state) => {
      const ids = legacyIds(state.requirements);
      return { ...state, requirements: state.requirements.filter((row) => !ids.has(row.id)) };
    }),
  };
}

test('the capture of 2027 had the retired legacy rows, never required, and the code no longer generates them', () => {
  const states = (
    archive.v4Catalogues[2027] as {
      states: { requirements: { id: string; basis?: string; byModality: object }[] }[];
    }
  ).states;
  const retired = states.flatMap((state) =>
    state.requirements.filter((row) => legacyIds([row]).size),
  );
  expect(retired.length).toBeGreaterThan(0);
  for (const row of retired)
    for (const offer of Object.values(row.byModality) as { applicability: string }[])
      expect(['optional', 'unconfigured']).toContain(offer.applicability);
  for (const settings of referenceSettings)
    expect(
      activityPlan({ ...settings, year: 2027 }).filter(
        (row) => row.basis === 'Classificação legada',
      ),
    ).toEqual([]);
});

test('only establishing or tightening versions bind reviews and base identities', () => {
  const change = (version: string, effect: RulesetChange['effect']): RulesetChange => ({
    version,
    effect,
    date: civilDate('2026-10-29'),
    source: 'Fonte sintética',
    summary: 'Mudança sintética',
  });
  const history = [
    change('x-v1', 'establishes'),
    change('x-v2', 'relaxes'),
    change('x-v3', 'editorial'),
    change('x-v4', 'tightens'),
    change('x-v5', 'relaxes'),
  ];
  expect(history.map((item) => reviewBoundary(item.version, history))).toEqual([
    'x-v1',
    'x-v1',
    'x-v1',
    'x-v4',
    'x-v4',
  ]);
  expect(reviewBoundary('x-v9', history)).toBe('x-v9');

  expect(reviewBoundary('consup-292-2027-v2')).toBe('consup-292-2027-v1');
  expect(equivalentRulesets('consup-292-2027-v1', 'consup-292-2027-v2')).toBe(true);
  expect(equivalentRulesets('consup-292-2027-v2', 'consup-292-2027-v3')).toBe(true);
  expect(rulesetChangesBetween('consup-292-2027-v2', 'consup-292-2027-v3')).toMatchObject([
    { version: 'consup-292-2027-v3', effect: 'editorial' },
  ]);
  expect(equivalentRulesets(undefined, 'consup-292-2027-v2')).toBe(false);
  expect(equivalentRulesets('consup-292-2027-v0', 'consup-292-2027-v2')).toBe(false);
  expect(equivalentRulesets('unconfigured:2028', 'consup-292-2027-v1')).toBe(false);
  expect(
    rulesetChangesBetween('consup-292-2027-v1', 'consup-292-2027-v2').map((c) => c.version),
  ).toEqual(['consup-292-2027-v2']);
  expect(rulesetChangesBetween(undefined, 'consup-292-2027-v2')).toHaveLength(2);
});

/** Observances have their own baseline; published requirement archives stay untouched. */
const observanceFingerprints: Record<string, string> = {
  'consup-292-2027-v4': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
  'consup-292-2027-v5': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
  'consup-292-2027-v6': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
  'consup-292-2027-v7': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
  'consup-292-2027-v8': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
};
test('observance permissions are bound to the current ruleset history', () => {
  for (const policy of boundPolicies) {
    const version = versionOf(policy, policy.year!);
    expect(bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(policy.observances))))).toBe(
      observanceFingerprints[version],
    );
  }
  expect(equivalentRulesets('consup-292-2027-v3', 'consup-292-2027-v4')).toBe(true);
});

/** The art. 5º classification has its own baseline: changing it needs a new ruleset version. */
const schoolDayFingerprints: Record<string, string> = {
  'consup-292-2027-v5': 'd87ba71081c910887995df3fb28fc342e22cb9846d881e597754de209f24e6f7',
  'consup-292-2027-v6': 'd87ba71081c910887995df3fb28fc342e22cb9846d881e597754de209f24e6f7',
  'consup-292-2027-v7': 'd87ba71081c910887995df3fb28fc342e22cb9846d881e597754de209f24e6f7',
  'consup-292-2027-v8': 'd87ba71081c910887995df3fb28fc342e22cb9846d881e597754de209f24e6f7',
};
test('school-day classification is bound to the current ruleset history', () => {
  for (const policy of boundPolicies) {
    const version = versionOf(policy, policy.year!);
    expect(bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(policy.schoolDay))))).toBe(
      schoolDayFingerprints[version],
    );
  }
  expect(reviewBoundary('consup-292-2027-v5')).toBe('consup-292-2027-v5');
  expect(equivalentRulesets('consup-292-2027-v4', 'consup-292-2027-v5')).toBe(false);
  // Default categories only colour new dates: v6 keeps the v5 reviews and bases.
  expect(equivalentRulesets('consup-292-2027-v5', 'consup-292-2027-v6')).toBe(true);
  // Splitting the art. 11, VII, deadline adds a required activity: v7 binds reviews again.
  expect(reviewBoundary('consup-292-2027-v7')).toBe('consup-292-2027-v7');
  expect(equivalentRulesets('consup-292-2027-v6', 'consup-292-2027-v7')).toBe(false);
  // An optional notice only relaxes: v8 keeps the v7 reviews and bases.
  expect(equivalentRulesets('consup-292-2027-v7', 'consup-292-2027-v8')).toBe(true);
});
