import { civilDate } from '../../src/domain/civil-date.ts';
import type { countCalendar } from '../../src/domain/calendar/counting/core.ts';
import type { CalendarEvent } from '../../src/domain/calendar/model.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { teacherVacations } from '../../src/domain/calendar/activities/teacher-vacations.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { durationEnd } from '../../src/domain/calendar/counting/duration.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { assessmentDayCounts } from '../../src/domain/calendar/counting/assessment-days.ts';

const state = {
  schemaVersion: 4 as const,
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
      stages: { perTerm: 2 },
    },
  ],
};
const excluded = (date: string) => ({
  id: date,
  start: civilDate(date),
  end: civilDate(date),
  kind: 'exclude',
});

test('third vacation excludes only counted dates; PDF, stages and automatic duration agree', () => {
  // Synthetic dates reproduce 16 -> 13; they are not the campus dates.
  const holidays = ['2027-10-11', '2027-10-12', '2027-10-15', '2027-10-28', '2027-10-29'].map(
    excluded,
  );
  const vacation = teacherVacations(2027, {
    firstStart: civilDate('2027-01-02'),
    firstEnd: civilDate('2027-01-16'),
    secondStart: civilDate('2027-07-01'),
    secondEnd: civilDate('2027-07-15'),
    thirdStart: civilDate('2027-10-06'),
    thirdEnd: civilDate('2027-10-08'),
  });
  assert(vacation.events.every((e: CalendarEvent) => e.kind === 'exclude'));
  assert.equal(evaluateCalendar(state, holidays).total, 16);
  for (const kind of ['exclude']) {
    const events = [...holidays, ...vacation.events.map((e: CalendarEvent) => ({ ...e, kind }))],
      original = structuredClone(events);
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
      durationEnd('2027-10-01', 13, state, events),
      result.ledger
        .filter((d: ReturnType<typeof countCalendar>['ledger'][number]) => d.counted)
        .at(-1)!.date,
    );
    assert.equal(
      assessmentDayCounts(
        {
          ...state,
          events: [
            {
              id: 'stage',
              kind: 'note',
              requirementId: 'stage-1:integrado',
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
    id: 'teacher-vacation-third',
    start: civilDate('2027-10-11'),
    end: civilDate('2027-10-17'),
    kind: 'exclude',
    offers: ['integrado'],
  };
  const saturday = {
    id: 'sat',
    start: civilDate('2027-10-16'),
    end: civilDate('2027-10-16'),
    kind: 'include',
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
  const result = evaluateCalendar(mixed, [vacation, saturday, excluded('2027-10-12')]);
  assert.equal(result.byOffer.integrado.total, 16);
  assert.equal(result.byOffer.graduacao.total, 21);
  assert.equal(
    result.byOffer.integrado.ledger.find(
      (d: ReturnType<typeof countCalendar>['ledger'][number]) => d.date === '2027-10-16',
    )!.counted,
    false,
  );
  const note = { ...vacation, kind: 'note' };
  assert.equal(evaluateCalendar(state, [note]).total, evaluateCalendar(state, []).total);
});
