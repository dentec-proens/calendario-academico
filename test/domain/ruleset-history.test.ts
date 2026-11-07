import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
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
import { catalogue, fingerprint } from '../helpers/catalogue-reference.ts';

/**
 * Catalogue fingerprint of each policy version. When this test fails on a bound policy, append a
 * version to its `rulesetChanges`, classify its effect and record the new version's fingerprint
 * here; never edit the fingerprint of a released version. Retired policies retain their published
 * fingerprints only in the archive checks. Changing `referenceSettings` or the fields left out of
 * the hash (`test/helpers/catalogue-reference.ts`) recomputes every runtime fingerprint and the
 * expected catalogue, so do it alone, with the rules unchanged.
 */
const catalogueFingerprints: Record<string, string> = {
  'legacy-2026-v1': 'b0e948ba297029f2f001473bd645baab6ed4f4a44c793835c9b3d0d6286a32df',
  'consup-292-2027-v2': 'bc56d935878de0a5af2150b3c0fbdb4575d74db77afc0e8f143e4318f31e1e8d',
  'consup-292-2027-v3': 'bc56d935878de0a5af2150b3c0fbdb4575d74db77afc0e8f143e4318f31e1e8d',
  'unconfigured:2028': '85a305ec506d13408190b3ec133c33b76ae7518951b8325ed3edc82f8a666d32',
};

/**
 * Capture of release A, kept for consultation: the catalogues it published (2026 to 2028) and the
 * settings and catalogues of its v4 comparison. Nothing reads it but the published fingerprints
 * below, and the whole file is checked by hash, since its value is that it never changes. The
 * expectation of the current code lives in `test/fixtures/catalogue-expected.json`.
 */
const archiveFile = new URL('../fixtures/ruleset-release-a-catalogues.json', import.meta.url);
const archive = JSON.parse(readFileSync(archiveFile, 'utf8')) as {
  historicalCatalogues: Record<string, unknown>;
};

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

test('the release A capture is intact and its published versions keep their fingerprints', () => {
  expect(createHash('sha256').update(readFileSync(archiveFile)).digest('hex')).toBe(
    '62bffefecc56d6c82d05dd52b0e1963e80bbb52520b3777a56b5df1a6d57614f',
  );
  for (const [version, expected] of Object.entries(catalogueFingerprints)) {
    const year =
      version === 'legacy-2026-v1' ? 2026 : version.startsWith('consup-292-2027') ? 2027 : 2028;
    expect(fingerprint(archive.historicalCatalogues[year]), version).toBe(expected);
  }
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
  'consup-292-2027-v10': '38b41ac8441397415e0ec925e5b25f7c5e508dc26dc912ce665ca3bf5baede1b',
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
  'consup-292-2027-v9': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
  'consup-292-2027-v10': 'afa2cb2556353696ba3b20ec0f40eac2058fb230108a031380c68dde5801d0c2',
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
  'consup-292-2027-v9': 'd87ba71081c910887995df3fb28fc342e22cb9846d881e597754de209f24e6f7',
  'consup-292-2027-v10': 'd87ba71081c910887995df3fb28fc342e22cb9846d881e597754de209f24e6f7',
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
  // Vacations become required activities: v10 binds reviews again.
  expect(reviewBoundary('consup-292-2027-v10')).toBe('consup-292-2027-v10');
  expect(equivalentRulesets('consup-292-2027-v9', 'consup-292-2027-v10')).toBe(false);
});
