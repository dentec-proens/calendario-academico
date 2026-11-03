import { expect, test } from 'vitest';
import type { CalendarOffer } from '../../src/domain/calendar/model.ts';
import { scopeStatus } from '../../src/domain/calendar/offers.ts';
import { contentAssessment } from '../../src/domain/calendar/readiness.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';

/**
 * The norm of an offer comes from its delivery mode unless the campus answered: the campus is
 * asked only while the mode is `a-conferir`.
 */
const withOffers = (change: (offer: CalendarOffer) => CalendarOffer) => {
  const state = calendarOffersFixture();
  return { ...state, offers: state.offers.map(change) };
};
const scopeIssues = (state: ReturnType<typeof calendarOffersFixture>) =>
  contentAssessment({ state, institutionalSnapshot: [] }).issues.filter((issue) =>
    issue.code.startsWith('scope'),
  );

test('the delivery mode decides the norm until the campus answers', () => {
  expect(scopeStatus({ delivery: 'presencial' })).toBe('covered');
  expect(scopeStatus({ delivery: 'ead' })).toBe('own-regulation');
  expect(scopeStatus({ delivery: 'a-conferir' })).toBeUndefined();
  // An answer of the campus wins, as for a presencial offer under its own regulation.
  expect(scopeStatus({ delivery: 'presencial', scope: { status: 'own-regulation' } })).toBe(
    'own-regulation',
  );
});

test('presencial offers need no confirmation and have their minimums checked', () => {
  const state = withOffers((offer) => ({ ...offer, delivery: 'presencial', scope: undefined }));
  expect(scopeIssues(state)).toEqual([]);
  const policy = policyFor(state.year);
  for (const offer of state.offers.filter((item) => !policy.excludes(item)))
    expect(policy.countingMinimums(state, offer).annual?.days, offer.id).toBe(200);
});

test('an EaD offer follows its own norm as if answered, and one to check still asks', () => {
  const ead = withOffers((offer) => ({ ...offer, delivery: 'ead', scope: undefined }));
  // As the explicit answer, its own norm leaves the calendar without automatic conclusion.
  const answered = withOffers((offer) => ({ ...offer, scope: { status: 'own-regulation' } }));
  expect(scopeIssues(ead)).toEqual(scopeIssues(answered));
  const policy = policyFor(ead.year);
  for (const offer of ead.offers)
    expect(policy.countingMinimums(ead, offer).annual, offer.id).toBeNull();
  const pending = withOffers((offer) => ({ ...offer, delivery: 'a-conferir', scope: undefined }));
  expect(scopeIssues(pending).length).toBeGreaterThan(0);
});
