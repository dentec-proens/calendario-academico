import { expect, test } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { AssessmentSettings } from '../../src/domain/calendar/model.ts';
import type { CalendarPolicy, RulesetChange } from '../../src/domain/policies/contract.ts';
import {
  equivalentRulesets,
  policyFor,
  reviewBoundary,
  rulesetChangesBetween,
} from '../../src/domain/policies/registry.ts';

/**
 * Catalogue fingerprint of each bound ruleset version. When this test fails, append a version to
 * the policy's `rulesetChanges`, classify its effect and record its fingerprint here. Never edit
 * the fingerprint of a version that has already been released.
 */
const catalogueFingerprints: Record<string, string> = {
  'consup-292-2027-v2': '58f9d60baba8521a585b6d701304dd94e7508628d7b4bcf7402114ec90bbec93',
};

const referenceStates: AssessmentSettings[] = [
  {
    year: 2027,
    modalities: ['integrado'],
    regime: 'anual',
    organizationByModality: { integrado: 'anual' },
    assessmentStagesByModality: { integrado: 4 },
    scopeConfirmation: { status: 'covered' },
  },
  {
    year: 2027,
    modalities: ['subsequente', 'graduacao'],
    regime: 'misto',
    organizationByModality: { subsequente: 'anual', graduacao: 'semestral' },
    assessmentStagesByModality: { subsequente: 2, graduacao: 2 },
    intakeByModality: {
      subsequente: { annual: { status: 'no' } },
      graduacao: { first: { status: 'yes', required: true }, second: { status: 'unknown' } },
    },
    scopeConfirmation: { status: 'covered' },
  },
  {
    year: 2027,
    modalities: ['integrado', 'subsequente', 'graduacao', 'posgraduacao'],
    regime: 'misto',
    organizationByModality: {
      integrado: 'anual',
      subsequente: 'semestral',
      graduacao: 'semestral',
      posgraduacao: 'semestral',
    },
    assessmentStagesByModality: { integrado: 3, subsequente: 2, graduacao: 2, posgraduacao: 2 },
  },
];

/** Everything a reviewer or campus would see change in the rules, for each reference state. */
function catalogue(policy: CalendarPolicy) {
  return {
    criteria: policy.review.criteria,
    excludedModalities: policy.excludedModalities,
    states: referenceStates.map((state) => ({
      window: policy.window(state),
      requirements: policy.requirements(state).map((requirement) => ({
        ...requirement,
        byModality: Object.fromEntries(
          (state.modalities ?? []).map((modality) => [
            modality,
            {
              applicability: policy.applicability(state, requirement, modality),
              note: policy.applicabilityNote?.(requirement.id, modality) ?? null,
              minimums: policy.countingMinimums(state, modality),
            },
          ]),
        ),
      })),
    })),
  };
}

const fingerprint = (policy: CalendarPolicy) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(catalogue(policy)))));

const boundPolicies = [policyFor(2027)];

test('every bound ruleset has an ordered history ending at the current version', () => {
  for (const policy of boundPolicies) {
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
    expect(policy.rulesetVersion(referenceStates[0])).toBe(changes.at(-1)!.version);
  }
});

test('the rules catalogue changes only together with a new ruleset version', () => {
  for (const policy of boundPolicies) {
    const version = policy.rulesetVersion(referenceStates[0]);
    expect(
      fingerprint(policy),
      `O catálogo de regras mudou sem nova versão. Acrescente uma entrada em rulesetChanges e registre a impressão digital de ${version} em catalogueFingerprints.`,
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
