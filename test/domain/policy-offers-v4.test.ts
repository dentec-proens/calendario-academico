import { expect, test } from 'vitest';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { policyFor, equivalentRulesets } from '../../src/domain/policies/registry.ts';

test('policy receives an opaque identity and applies kind, scope and source independently', () => {
  const state = calendarOffersV4Fixture();
  const offer = state.offers[2];
  offer.id = 'curso-opaco-7';
  const policy = policyFor(state.year);
  const requirement = policy.requirements(state).find((row) => row.id === 'stage-1:curso-opaco-7')!;
  expect(requirement).toBeDefined();
  expect(policy.applicability(state, requirement, offer)).toBe('required');
  expect(
    policy.applicabilityNote?.(
      {
        id: 'synthetic',
        name: 'Nota',
        optionalFor: { graduacao: 'Cadastro permitido para graduação.' },
      },
      offer,
    ),
  ).toBe('Cadastro permitido para graduação.');
  expect(policy.excludes(offer)).toBe(false);
  expect(policy.countingMinimums(state, offer)).toEqual({
    annual: { days: 200, basis: expect.stringContaining('Art. 4º') },
    semester: { days: 100, basis: expect.stringContaining('§ 1º') },
  });
  offer.scope = { status: 'own-regulation' };
  expect(policy.applicability(state, requirement, offer)).toBe('unconfigured');
  expect(policy.countingMinimums(state, offer)).toEqual({ annual: null, semester: null });
});

test('the offer editorial version preserves the review boundary and historical minima', () => {
  const policy = policyFor(2027);
  expect(policy.rulesetChanges?.at(-1)).toMatchObject({
    version: 'consup-292-2027-v3',
    effect: 'editorial',
    date: '2026-10-29',
  });
  expect(equivalentRulesets('consup-292-2027-v2', 'consup-292-2027-v3')).toBe(true);
  const state = calendarOffersV4Fixture();
  expect(policy.countingMinimums(state, state.offers[1]).annual?.days).toBe(200);
  expect(policy.countingMinimums(state, state.offers[2]).annual?.days).toBe(200);
  expect(policy.countingMinimums(state, state.offers[2]).semester?.days).toBe(100);
  expect(policyFor(2026).countingMinimums(state, state.offers[2])).toEqual({
    annual: null,
    semester: null,
  });
  expect(policyFor(2028).countingMinimums(state, state.offers[2])).toEqual({
    annual: null,
    semester: null,
  });
});
