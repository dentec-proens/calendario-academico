import { expect, test } from 'vitest';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { diagnoseCalendar, diagnoseTeachingDays } from '../../src/domain/calendar/diagnostics.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year-integrado',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'first',
        start: '2027-02-01',
        end: '2027-06-30',
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
    ],
    events: [],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        scope: { status: 'covered' },
      },
    ],
  };
}

test('local diagnostics and confirmed readiness require the same missing semester, without changing the snapshot', () => {
  const state = calendar();
  const before = structuredClone(state);
  expect(diagnoseCalendar(state).structure).toEqual([
    { code: 'period-count', offerId: 'graduacao', expected: 2, actual: 1 },
  ]);
  const readiness = releaseReadiness(
    { id: 'calendar', catalogueRevision: 1, institutionalSnapshot: [], state },
    { catalogue: { revision: 1 } },
  );
  expect(readiness.issues).toContain('Graduação — Cadastre os dois semestres letivos.');
  expect(readiness.ready).toBe(false);
  expect(state).toEqual(before);

  const applied = {
    ...state,
    periods: [
      ...state.periods,
      {
        id: 'second',
        start: '2027-08-02',
        end: '2027-12-17',
        association: { status: 'defined' as const, offers: ['graduacao'], term: 'second' as const },
      },
    ],
  };
  expect(diagnoseCalendar(applied).structure).toEqual([]);
  // Applying a change does not alter the confirmed record or certify its human review.
  expect(diagnoseCalendar(state).structure).toHaveLength(1);
  expect(
    releaseReadiness(
      { id: 'calendar', catalogueRevision: 1, institutionalSnapshot: [], state: applied },
      { catalogue: { revision: 1 } },
    ).humanReview.current,
  ).toBe(false);
});

test('mixed offers retain annual and semester counting checks in their own scope', () => {
  const state = calendar();
  const checks = diagnoseTeachingDays(state, evaluateCalendar(state, []));
  expect(
    checks.map(({ offerId: modality, scope, expected }) => ({
      offerId: modality,
      scope,
      expected,
    })),
  ).toEqual([
    { offerId: 'integrado', scope: 'annual', expected: 200 },
    { offerId: 'graduacao', scope: 'annual', expected: 200 },
    { offerId: 'graduacao', scope: 'first', expected: 100 },
  ]);
  const unconfirmed = {
    ...state,
    offers: state.offers.map((offer) => ({ ...offer, scope: undefined })),
  };
  expect(
    diagnoseTeachingDays(unconfirmed, evaluateCalendar(unconfirmed, [])).every(
      (check) => check.status === 'NOT_VERIFIABLE',
    ),
  ).toBe(true);
});

test('an incomplete calendar remains diagnosable while counting is unavailable', () => {
  const state = {
    ...calendar(),
    weekConfirmed: false,
    periods: [],
    offers: calendar().offers.map((offer) => ({
      ...offer,
      organization:
        {
          integrado: 'a-classificar' as const,
          graduacao: 'semestral' as const,
        }[offer.id] ?? 'a-classificar',
    })),
  };
  expect(diagnoseCalendar(state).structure).toEqual([
    { code: 'week-unconfirmed' },
    { code: 'periods-missing' },
    { code: 'organization-unclassified', offerId: 'integrado' },
    { code: 'period-count', offerId: 'graduacao', expected: 2, actual: 0 },
  ]);
});
