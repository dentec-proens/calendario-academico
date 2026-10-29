import { expect, test } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { ActivityRequirement, AssessmentSettings } from '../../src/domain/calendar/model.ts';
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
  'unconfigured:2028': '85a305ec506d13408190b3ec133c33b76ae7518951b8325ed3edc82f8a666d32',
};

/** Offer combinations, cycles and stage counts that exercise every catalogue branch. */
const referenceSettings: Omit<AssessmentSettings, 'year'>[] = [
  {
    modalities: ['integrado'],
    regime: 'anual',
    organizationByModality: { integrado: 'anual' },
    assessmentStagesByModality: { integrado: 4 },
    scopeConfirmation: { status: 'covered' },
  },
  {
    modalities: ['subsequente', 'graduacao'],
    regime: 'misto',
    organizationByModality: { subsequente: 'anual', graduacao: 'semestral' },
    assessmentStagesByModality: { subsequente: 2, graduacao: 2 },
    intakeByModality: {
      subsequente: { annual: { status: 'no' } },
      graduacao: { first: { status: 'yes', required: true }, second: { status: 'unknown' } },
    },
    secondSemesterIntake: false,
    scopeConfirmation: { status: 'covered' },
  },
  {
    modalities: ['integrado', 'subsequente', 'graduacao', 'posgraduacao'],
    regime: 'semestral',
    organizationByModality: {
      integrado: 'anual',
      subsequente: 'semestral',
      graduacao: 'semestral',
      posgraduacao: 'semestral',
    },
    assessmentStagesByModality: { integrado: 3, subsequente: 2, graduacao: 2, posgraduacao: 2 },
  },
  {
    modalities: ['graduacao'],
    regime: 'semestral',
    organizationByModality: { graduacao: 'semestral' },
    assessmentStagesByModality: { graduacao: 2 },
    scopeConfirmation: { status: 'own-regulation' },
  },
  {
    modalities: ['integrado', 'subsequente'],
    regime: 'misto',
    organizationByModality: { integrado: 'anual', subsequente: 'anual' },
    assessmentStagesByModality: { integrado: 4, subsequente: 5 },
    intakeByModality: { integrado: { annual: { status: 'yes', required: false } } },
    secondSemesterIntake: true,
  },
];

/**
 * Requirement fields left out of the hash because they act only through `byModality`. Every other
 * field, including fields added later, is part of the fingerprint.
 */
const hidden = new Set<string>([
  'required',
  'applicability',
  'optionalFor',
] satisfies (keyof ActivityRequirement)[]);

const note = (policy: CalendarPolicy, requirement: ActivityRequirement, modality: string) =>
  policy.applicabilityNote?.(requirement, modality) ?? null;

function catalogue(policy: CalendarPolicy, year: number) {
  return {
    criteria: policy.review.criteria,
    excludedModalities: policy.excludedModalities,
    states: referenceSettings.map((settings) => {
      const state = { ...settings, year };
      return {
        window: policy.window(state),
        requirements: activityChecklist(state).map((requirement) => ({
          ...Object.fromEntries(Object.entries(requirement).filter(([key]) => !hidden.has(key))),
          byModality: Object.fromEntries(
            (state.modalities ?? []).map((modality) => [
              modality,
              {
                applicability: policy.applicability(state, requirement, modality),
                note: note(policy, requirement, modality),
                minimums: policy.countingMinimums(state, modality),
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

const fingerprint = (policy: CalendarPolicy, year: number) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(catalogue(policy, year))))));

const years = [2026, 2027, 2028];
const boundPolicies = years.map(policyFor).filter((policy) => policy.rulesetPrefix);
const versionOf = (policy: CalendarPolicy, year: number) =>
  policy.rulesetVersion({ year, modalities: ['integrado'] });

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

test('the rules catalogue changes only together with a new ruleset version', () => {
  for (const year of years) {
    const policy = policyFor(year);
    const version = versionOf(policy, year);
    expect(
      fingerprint(policy, year),
      policy.rulesetChanges
        ? `O catálogo de regras mudou sem nova versão. Acrescente uma entrada em rulesetChanges e registre a impressão digital da nova versão em catalogueFingerprints.`
        : `O catálogo de ${version} mudou. Confirme que a mudança é intencional e registre a nova impressão digital de ${version} em catalogueFingerprints.`,
    ).toBe(catalogueFingerprints[version]);
  }
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
  expect(equivalentRulesets(undefined, 'consup-292-2027-v2')).toBe(false);
  expect(equivalentRulesets('consup-292-2027-v0', 'consup-292-2027-v2')).toBe(false);
  expect(equivalentRulesets('legacy-2026-v1', 'consup-292-2027-v1')).toBe(false);
  expect(
    rulesetChangesBetween('consup-292-2027-v1', 'consup-292-2027-v2').map((c) => c.version),
  ).toEqual(['consup-292-2027-v2']);
  expect(rulesetChangesBetween(undefined, 'consup-292-2027-v2')).toHaveLength(2);
});
