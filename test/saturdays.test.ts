import type { ActivityState, CalendarActivity } from '../src/domain-types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { monthSaturdays, saturdayEvents } from '../src/saturdays.ts';
import { evaluateCalendar as calendarResult } from '../src/evaluation.ts';
import { applySaturdayActivities, applySaturdays } from '../src/calendar-edits/commands.ts';

test('month selection adds only chosen Saturdays, survives serialization, and respects conflicts', () => {
  const s = {
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata',
    periods: [{ id: 'year', name: 'Ano', start: '2027-02-01', end: '2027-03-31' }],
    events: [] as CalendarActivity[],
  };
  assert.deepEqual(monthSaturdays(2027, 2), [
    '2027-02-06',
    '2027-02-13',
    '2027-02-20',
    '2027-02-27',
  ]);
  let id = 0;
  const make = () => String(++id);
  s.events = saturdayEvents(
    s,
    ['2027-02-06', '2027-02-20', '2027-02-20'],
    'Sábado letivo',
    'Ata 1',
    make,
  );
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(calendarResult(restored, restored.events).byWeekday[6], 2);
  assert.equal(saturdayEvents(s, ['2027-02-06'], 'Sábado', 'Ata', make).length, 0);
  const result = calendarResult(s, [
    ...s.events,
    {
      id: 'holiday',
      name: 'Feriado',
      start: '2027-02-20',
      end: '2027-02-20',
      kind: 'exclude',
      evidence: 'Lei',
    },
  ]);
  assert.equal(result.byWeekday[6], 1);
  assert.equal(result.conflicts.length, 1);
  assert.throws(() => saturdayEvents(s, ['2027-04-03'], 'Sábado', 'Ata', make), /fora/);
  assert.throws(() => saturdayEvents(s, ['2027-02-05'], 'Sábado', 'Ata', make), /sábados/);
  assert.throws(() => saturdayEvents(s, ['2027-02-27'], 'Sábado', '', make), /fonte/);
});

test('a confirmed annual selection includes Saturdays from different months in one atomic command', () => {
  const state: ActivityState = {
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata',
    periods: [{ id: 'year', start: '2027-02-01', end: '2027-12-17' }],
    events: [],
  };
  const original = structuredClone(state);
  const selected = {
    dates: ['2027-03-06', '2027-08-07', '2027-03-06'],
    name: 'Atividades de reposição',
    evidence: 'Resolução nº 12/2026',
    confirmed: true,
  };
  let id = 0;
  const changed = applySaturdays(state, selected, [], () => String(++id));
  assert.deepEqual(
    changed.events.map((event) => event.start),
    ['2027-03-06', '2027-08-07'],
  );
  assert.ok(changed.events.every((event) => event.evidence === selected.evidence));
  assert.equal(applySaturdays(changed, selected, [], () => String(++id)).events.length, 2);
  assert.deepEqual(state, original);
  assert.throws(
    () => applySaturdays(state, { ...selected, confirmed: false }, [], () => String(++id)),
    /Confirme/,
  );
  assert.throws(
    () =>
      applySaturdays(state, { ...selected, dates: ['2027-03-06', '2027-01-02'] }, [], () =>
        String(++id),
      ),
    /fora dos períodos letivos/,
  );
  assert.deepEqual(state, original);
});

test('each Saturday keeps its activity and decision and a failed batch changes nothing', () => {
  const state: ActivityState = {
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata',
    periods: [{ id: 'year', start: '2027-02-01', end: '2027-12-17' }],
    events: [],
  };
  const original = structuredClone(state);
  const activities = [
    { date: '2027-03-06', name: 'Feira de ciências', evidence: 'Portaria 1/2027' },
    { date: '2027-08-07', name: 'Reposição de aulas', evidence: 'Ata 2/2027' },
  ];
  let id = 0;
  const changed = applySaturdayActivities(state, activities, [], () => String(++id));
  assert.deepEqual(
    changed.events.map(({ start, name, evidence }) => ({ date: start, name, evidence })),
    activities,
  );
  assert.equal(
    applySaturdayActivities(changed, activities, [], () => String(++id)).events.length,
    2,
  );
  assert.throws(
    () =>
      applySaturdayActivities(
        state,
        [activities[0]!, { ...activities[1]!, evidence: '' }],
        [],
        () => String(++id),
      ),
    /07\/08\/2027:.*fonte/,
  );
  assert.throws(
    () =>
      applySaturdayActivities(
        state,
        [activities[0]!, { ...activities[1]!, date: '2027-01-02' }],
        [],
        () => String(++id),
      ),
    /fora dos períodos/,
  );
  assert.throws(() => applySaturdayActivities(state, [], [], () => String(++id)), /Selecione/);
  assert.deepEqual(state, original);
});
