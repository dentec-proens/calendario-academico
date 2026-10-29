import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  ActivityRequirement,
  AssessmentSettings,
  CalendarOffer,
} from '../../src/domain/calendar/model.ts';
import { calendarOffers } from '../../src/domain/calendar/offers.ts';
import { modalityIds } from '../../src/domain/calendar/config.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import type { CalendarPolicy, RulesetChange } from '../../src/domain/policies/contract.ts';
import {
  equivalentRulesets,
  policyFor,
  reviewBoundary,
  rulesetChangesBetween,
} from '../../src/domain/policies/registry.ts';

/**
 * Catalogue fingerprint of each policy version. When this test fails on a bound policy, append a
 * version to its `rulesetChanges`, classify its effect and record the new version's fingerprint
 * here; never edit the fingerprint of a released version. Policies without `rulesetChanges`
 * (2026 and years without a norm) have one fixed version: record their new fingerprint in place
 * after confirming the change. Changing `hidden` or `referenceSettings` recomputes every
 * fingerprint, so do it alone, with the rules unchanged.
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
const referenceSettings = archive.v4Settings;

/**
 * Requirement fields left out of the hash because they act only through `byModality`. Every other
 * field, including fields added later, is part of the fingerprint.
 */
const hidden = new Set<string>([
  'required',
  'applicability',
  'optionalFor',
] satisfies (keyof ActivityRequirement)[]);

const note = (policy: CalendarPolicy, requirement: ActivityRequirement, offer: CalendarOffer) =>
  policy.applicabilityNote?.(requirement, offer) ?? null;

function catalogue(policy: CalendarPolicy, year: number) {
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
    states: referenceSettings.map((settings) => {
      const state = { ...settings, year };
      return {
        window: policy.window(state),
        requirements: activityChecklist(state).map((requirement) => ({
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

const years = [2026, 2027, 2028];
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
 * Activity IDs released by each bound policy. Saved events link to them, and normalization rejects
 * an event whose activity left the checklist, so released activities are never removed.
 */
const releasedActivities: Record<number, readonly string[]> = {
  2027: [
    'stage',
    'results',
    'council',
    'pedagogical-meeting',
    'final',
    'diary',
    'recognition',
    'final-appeal',
    'admission-notice',
    'enrolment',
    'adjustment',
    'withdrawal',
    'registration',
    'pit',
    'rit',
    'teaching-plan',
    'extraordinary-council',
    'family-meeting',
    'campus-events',
    'alumni-meeting',
    'internship-event',
    'regular-admission-notice',
    'robotics',
    'course-showcase',
    'pedagogical-training',
    'collective-planning',
    'women-week',
    'ethics-week',
    'cultural-week',
  ],
};

test('released activities stay declared so saved records keep resolving', () => {
  for (const policy of boundPolicies) {
    const released = releasedActivities[policy.year!] ?? [];
    const declared = policy.catalogue!.flatMap((section) => section.rows.map((row) => row.id));
    expect(
      released.filter((id) => !declared.includes(id)),
      'Uma atividade publicada saiu da tabela e invalidaria calendários que a vinculam. Mantenha a linha, por exemplo opcional com optionalFor.',
    ).toEqual([]);
    expect(
      declared.filter((id) => !released.includes(id)),
      'Registre a nova atividade em releasedActivities.',
    ).toEqual([]);
  }
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
    expect(canonical(catalogue(policyFor(year), year)), String(year)).toEqual(
      canonical(archive.v4Catalogues[year]),
    );
});

test('only establishing or tightening versions bind reviews and base identities', () => {
  const change = (version: string, effect: RulesetChange['effect']): RulesetChange => ({
    version,
    effect,
    date: '2026-10-29',
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
  expect(equivalentRulesets('legacy-2026-v1', 'consup-292-2027-v1')).toBe(false);
  expect(
    rulesetChangesBetween('consup-292-2027-v1', 'consup-292-2027-v2').map((c) => c.version),
  ).toEqual(['consup-292-2027-v2']);
  expect(rulesetChangesBetween(undefined, 'consup-292-2027-v2')).toHaveLength(2);
});
