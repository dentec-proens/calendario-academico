import { expect, test } from 'vitest';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { diagnoseCalendar, diagnoseTeachingDays } from '../../src/domain/calendar/diagnostics.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 3,
    year: 2027,
    modalities: ['integrado', 'graduacao'],
    regime: 'misto',
    organizationByModality: { integrado: 'anual', graduacao: 'semestral' },
    scopeConfirmation: { status: 'covered' },
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year-integrado',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
      },
      {
        id: 'first',
        start: '2027-02-01',
        end: '2027-06-30',
        association: { status: 'defined', modalities: ['graduacao'], term: 'first' },
      },
    ],
    events: [],
  };
}

test('local diagnostics and confirmed readiness require the same missing semester, without changing the snapshot', () => {
  const state = calendar();
  const before = structuredClone(state);
  expect(diagnoseCalendar(state).structure).toEqual([
    { code: 'period-count', modality: 'graduacao', expected: 2, actual: 1 },
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
        association: {
          status: 'defined' as const,
          modalities: ['graduacao'],
          term: 'second' as const,
        },
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
  expect(checks.map(({ modality, scope, expected }) => ({ modality, scope, expected }))).toEqual([
    { modality: 'integrado', scope: 'annual', expected: 200 },
    { modality: 'graduacao', scope: 'annual', expected: 200 },
    { modality: 'graduacao', scope: 'first', expected: 100 },
  ]);
  const unconfirmed = { ...state, scopeConfirmation: undefined };
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
    organizationByModality: {
      integrado: 'a-classificar' as const,
      graduacao: 'semestral' as const,
    },
  };
  expect(diagnoseCalendar(state).structure).toEqual([
    { code: 'week-unconfirmed' },
    { code: 'periods-missing' },
    { code: 'organization-unclassified', modality: 'integrado' },
    { code: 'period-count', modality: 'graduacao', expected: 2, actual: 0 },
  ]);
});
