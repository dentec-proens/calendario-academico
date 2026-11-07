import { civilDate } from '../../src/domain/civil-date.ts';
import type { countCalendar } from '../../src/domain/calendar/counting/core.ts';
import { test } from 'vitest';
import { definedStage } from '../helpers/activity-links.ts';
import assert from 'node:assert/strict';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { assessmentDayCounts } from '../../src/domain/calendar/counting/assessment-days.ts';

const state = {
  schemaVersion: 7 as const,
  year: 2027,
  campus: 'Fixture',
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [
    {
      id: 'oct',
      name: 'Outubro',
      start: civilDate('2027-10-01'),
      end: civilDate('2027-10-31'),
      association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
    },
  ],
  offers: [
    {
      id: 'integrado',
      kind: 'integrado' as const,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
      stages: { status: 'defined' as const, perTerm: 2 },
    },
  ],
};
const excluded = (date: string, offers = ['integrado']) => ({
  id: date,
  start: civilDate(date),
  end: civilDate(date),
  effect: 'exclude' as const,
  offers,
});

test('third vacation excludes only counted dates; PDF, stages and automatic duration agree', () => {
  // Synthetic dates reproduce 16 -> 13; they are not the campus dates.
  const holidays = ['2027-10-11', '2027-10-12', '2027-10-15', '2027-10-28', '2027-10-29'].map(
    (date) => excluded(date),
  );
  const vacation = [
    ['january', '2027-01-02', '2027-01-16'],
    ['july', '2027-07-01', '2027-07-15'],
    ['october', '2027-10-06', '2027-10-08'],
  ].map(([id, start, end]) => ({
    id: id!,
    name: 'Férias docentes',
    start: civilDate(start!),
    end: civilDate(end!),
    category: 'ferias',
  }));
  assert.equal(evaluateCalendar(state, holidays).total, 16);
  for (const effect of ['exclude' as const]) {
    const events = [...holidays, ...vacation.map((e) => ({ ...e, effect, offers: ['integrado'] }))];
    const original = structuredClone(events);
    const result = evaluateCalendar(state, events);
    assert.equal(result.total, 13);
    for (const date of ['2027-10-06', '2027-10-07', '2027-10-08'])
      assert.equal(
        result.ledger.find(
          (d: ReturnType<typeof countCalendar>['ledger'][number]) => d.date === date,
        )!.counted,
        false,
      );
    assert.equal(
      assessmentDayCounts(
        {
          ...state,
          events: [
            {
              id: 'stage',
              effect: 'note' as const,
              offers: ['integrado'],
              activity: definedStage('stage', 'integrado', 'annual', 1),
              start: civilDate('2027-10-01'),
              end: civilDate('2027-10-31'),
            },
          ],
        },
        events,
      ).stage[0].days,
      13,
    );
    assert.match(proensLayout(state, events, result), /13 dias letivos/);
    assert.deepEqual(events, original);
  }
});

test('vacation overlaps never double subtract holidays; Saturdays and offer scope remain respected', () => {
  const vacation = {
    id: 'vacation',
    start: civilDate('2027-10-11'),
    end: civilDate('2027-10-17'),
    effect: 'exclude' as const,
    offers: ['integrado'],
  };
  const saturday = {
    id: 'sat',
    start: civilDate('2027-10-16'),
    end: civilDate('2027-10-16'),
    effect: 'include' as const,
    offers: ['integrado', 'graduacao'],
  };
  const mixed = {
    ...state,
    periods: state.periods.map((period) => ({
      ...period,
      association: { ...period.association, offers: ['integrado', 'graduacao'] },
    })),
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
  const result = evaluateCalendar(mixed, [
    vacation,
    saturday,
    excluded('2027-10-12', ['integrado', 'graduacao']),
  ]);
  assert.equal(result.byOffer.integrado.total, 16);
  assert.equal(result.byOffer.graduacao.total, 21);
  assert.equal(
    result.byOffer.integrado.ledger.find(
      (d: ReturnType<typeof countCalendar>['ledger'][number]) => d.date === '2027-10-16',
    )!.counted,
    false,
  );
  const note = { ...vacation, effect: 'note' as const };
  assert.equal(evaluateCalendar(state, [note]).total, evaluateCalendar(state, []).total);
});
