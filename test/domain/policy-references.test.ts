import { expect, test } from 'vitest';
import type { CalendarOffer } from '../../src/domain/calendar/model.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { activityRuleText, periodReference } from '../../src/domain/policy-references.ts';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';
import { readyContent } from '../helpers/lifecycle.ts';

const offer = (fields: Partial<CalendarOffer> = {}): CalendarOffer => ({
  id: 'integrado',
  kind: 'integrado',
  delivery: 'presencial',
  organization: 'anual',
  ...fields,
});

test('the period reference states the window read from the policy', () => {
  const window = policyFor(2027).window({ year: 2027, offers: [offer()] })!;
  expect(window.latestStart).toBe('2027-02-15');
  expect(periodReference(2027, offer())).toBe(
    `Referência 2027: 1 fev a 17 dez, início até 15 fev (${window.basis}).`,
  );
  // Scope still to be confirmed: the norm applies until the offer is declared out of it.
  expect(periodReference(2027, offer({ delivery: 'a-conferir' }))).toContain('início até 15 fev');
});

test('no reference for a year without a norm or an offer out of its scope', () => {
  expect(periodReference(2026, offer())).toBeUndefined();
  expect(periodReference(2027, offer({ kind: 'posgraduacao' }))).toBeUndefined();
  expect(periodReference(2027, offer({ delivery: 'ead' }))).toBeUndefined();
  expect(
    periodReference(2027, offer({ scope: { status: 'own-regulation', note: '' } } as never)),
  ).toBeUndefined();
});

test('an activity is explained by its criterion in the policy', () => {
  const state = { ...readyContent(), year: 2027 };
  const recognition = activityPlan(state).find((item) => item.id === 'recognition-0')!;
  expect(activityRuleText(2027, recognition)).toBe(
    reviewCriteriaFor(2027).find((criterion) => criterion.id === 'VI')!.requirement,
  );
});

test('an activity with no text of the norm says nothing', () => {
  const state = { ...readyContent(), year: 2027 };
  const registration = activityPlan(state).find((item) => !item.reviewCriterionId)!;
  expect(activityRuleText(2027, registration)).toBeUndefined();
  // The parecer of a year without a norm names its items but states no requirement.
  expect(activityRuleText(2026, { reviewCriterionId: 'VI' })).toBeUndefined();
});
