import type { ActivityState, CalendarActivity } from '../src/domain-types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  monthSaturdays,
  saturdayEvents,
  saturdayGain,
  saturdayYear,
  type YearSaturday,
} from '../src/saturdays.ts';
import { evaluateCalendar as calendarResult } from '../src/evaluation.ts';
import {
  applySaturdayActivities,
  applySaturdays,
  updateSaturdayActivity,
} from '../src/calendar-edits/commands.ts';

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

const yearState: ActivityState = {
  year: 2027,
  offer: 'integrado',
  modalities: ['integrado'],
  regime: 'anual',
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  weekEvidence: 'Ata',
  periods: [{ id: 'year', name: 'Ano', start: '2027-03-01', end: '2027-03-31' }],
  events: [
    {
      id: 's1',
      name: 'Feira de ciências',
      evidence: 'Ata 1',
      kind: 'include',
      category: 'sabado',
      start: '2027-03-06',
      end: '2027-03-06',
    },
    {
      id: 'semana',
      name: 'Semana acadêmica',
      evidence: 'Calendário institucional',
      kind: 'include',
      category: 'institucional',
      start: '2027-03-22',
      end: '2027-03-27',
    },
    {
      id: 's2',
      name: 'Reposição',
      evidence: 'Ata 2',
      kind: 'include',
      category: 'sabado',
      start: '2027-06-05',
      end: '2027-06-05',
    },
  ],
};
const holiday: CalendarActivity = {
  id: 'holiday',
  name: 'Feriado municipal',
  evidence: 'Lei',
  kind: 'exclude',
  start: '2027-03-20',
  end: '2027-03-20',
};
const pick = (event?: CalendarActivity) => ({ name: event?.name, evidence: event?.evidence });

test('saturday year classifies each Saturday and keeps registered dates reachable', () => {
  const months = saturdayYear(yearState, [...yearState.events, holiday]);
  const march = months[2]!;
  const sat = (date: string) =>
    months.flatMap((m) => m.days).find((d) => d.date === date) as YearSaturday;
  assert.equal(months.length, 12);
  assert.equal(march.name, 'Março');
  assert.equal(march.leadingBlanks, 1);
  assert.equal(march.registered, 2);
  assert.deepEqual([sat('2027-03-06').status, sat('2027-03-06').editable], ['registered', true]);
  assert.deepEqual([sat('2027-03-13').status, sat('2027-03-13').impediments], ['available', []]);
  assert.deepEqual(sat('2027-03-20').impediments, ['Feriado municipal']);
  assert.deepEqual([sat('2027-03-27').status, sat('2027-03-27').editable], ['registered', false]);
  assert.equal(sat('2027-04-03').status, 'outside');
  assert.deepEqual([sat('2027-06-05').status, sat('2027-06-05').editable], ['registered', true]);
  assert.equal(saturdayGain(months, ['2027-03-13', '2027-03-20', '2027-04-03', '2027-03-06']), 1);
});

test('updating a Saturday activity trims values and rejects other records', () => {
  const next = updateSaturdayActivity(
    yearState,
    { id: 's1', name: '  Reposição ', evidence: ' Res. 12 ' },
    [],
  );
  assert.deepEqual(pick(next.events.find((e) => e.id === 's1')), {
    name: 'Reposição',
    evidence: 'Res. 12',
  });
  assert.throws(
    () => updateSaturdayActivity(yearState, { id: 'x', name: 'a', evidence: 'b' }, []),
    /não existe mais/,
  );
  assert.throws(
    () => updateSaturdayActivity(yearState, { id: 'semana', name: 'a', evidence: 'b' }, []),
    /Atividades e datas do campus/,
  );
  assert.throws(
    () => updateSaturdayActivity(yearState, { id: 's1', name: ' ', evidence: 'b' }, []),
    /atividade e a fonte/,
  );
});
