import type { ActivityState, CalendarActivity } from '../../src/domain/calendar/model.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  monthSaturdays,
  saturdayEvents,
  saturdayGain,
  saturdayYear,
  type YearSaturday,
} from '../../src/domain/calendar/activities/saturdays.ts';
import { evaluateCalendar as calendarResult } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  applySaturdayActivities,
  applySaturdays,
  updateSaturdayActivity,
} from '../../src/domain/calendar/commands/saturdays.ts';

test('v4 Saturdays require the teaching period of every offer identity', () => {
  const state = calendarOffersV4Fixture();
  const day = (date: string) =>
    saturdayYear(state, [])
      .flatMap((month) => month.days)
      .find((day) => day.date === date) as YearSaturday;
  assert.equal(day('2027-03-06').status, 'available');
  assert.equal(day('2027-07-17').status, 'outside');
  assert.throws(
    () => saturdayEvents(state, ['2027-07-17'], 'Atividade', () => 'saturday'),
    /fora dos períodos/,
  );
  const missing = {
    ...state,
    periods: state.periods.filter(
      (period) =>
        period.association.status !== 'defined' ||
        !period.association.offers.includes('graduacao-2'),
    ),
  };
  assert.throws(
    () => saturdayEvents(missing, ['2027-03-06'], 'Atividade', () => 'saturday'),
    /fora dos períodos/,
  );
  assert.throws(
    () => saturdayEvents({ ...state, periods: [] }, ['2027-03-06'], 'Atividade', () => 'saturday'),
    /fora dos períodos/,
  );
});

test('month selection adds only chosen Saturdays, survives serialization, and respects conflicts', () => {
  const s = {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano',
        start: '2027-02-01',
        end: '2027-03-31',
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: [] as CalendarActivity[],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
  assert.deepEqual(monthSaturdays(2027, 2), [
    '2027-02-06',
    '2027-02-13',
    '2027-02-20',
    '2027-02-27',
  ]);
  let id = 0;
  const make = () => String(++id);
  s.events = saturdayEvents(s, ['2027-02-06', '2027-02-20', '2027-02-20'], 'Sábado letivo', make);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(calendarResult(restored, restored.events).byWeekday[6], 2);
  assert.equal(saturdayEvents(s, ['2027-02-06'], 'Sábado', make).length, 0);
  const result = calendarResult(s, [
    ...s.events,
    { id: 'holiday', name: 'Feriado', start: '2027-02-20', end: '2027-02-20', kind: 'exclude' },
  ]);
  assert.equal(result.byWeekday[6], 1);
  assert.equal(result.conflicts.length, 1);
  assert.throws(() => saturdayEvents(s, ['2027-04-03'], 'Sábado', make), /fora/);
  assert.throws(() => saturdayEvents(s, ['2027-02-05'], 'Sábado', make), /sábados/);
  assert.throws(() => saturdayEvents(s, ['2027-02-27'], '', make), /atividade/);
});

test('a confirmed annual selection includes Saturdays from different months in one atomic command', () => {
  const state: ActivityState = {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: [],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
  const original = structuredClone(state);
  const selected = {
    dates: ['2027-03-06', '2027-08-07', '2027-03-06'],
    name: 'Atividades de reposição',
    confirmed: true,
  };
  let id = 0;
  const changed = applySaturdays(state, selected, [], () => String(++id));
  assert.deepEqual(
    changed.events.map((event) => event.start),
    ['2027-03-06', '2027-08-07'],
  );
  assert.ok(changed.events.every((event) => !Object.hasOwn(event, 'evidence')));
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

test('each Saturday keeps its activity and date without a source and a failed batch changes nothing', () => {
  const state: ActivityState = {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: [],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
  const original = structuredClone(state);
  const activities = [
    { date: '2027-03-06', name: 'Feira de ciências' },
    { date: '2027-08-07', name: 'Reposição de aulas' },
  ];
  let id = 0;
  const changed = applySaturdayActivities(state, activities, [], () => String(++id));
  assert.deepEqual(
    changed.events.map(({ start, name }) => ({ date: start, name })),
    activities,
  );
  assert.equal(
    applySaturdayActivities(changed, activities, [], () => String(++id)).events.length,
    2,
  );
  assert.throws(
    () =>
      applySaturdayActivities(state, [activities[0]!, { ...activities[1]!, name: '' }], [], () =>
        String(++id),
      ),
    /07\/08\/2027:.*atividade/,
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
  schemaVersion: 4 as const,
  year: 2027,
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [
    {
      id: 'year',
      name: 'Ano',
      start: '2027-03-01',
      end: '2027-03-31',
      association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
    },
  ],
  events: [
    {
      id: 's1',
      name: 'Feira de ciências',
      kind: 'include',
      category: 'sabado',
      start: '2027-03-06',
      end: '2027-03-06',
    },
    {
      id: 'semana',
      name: 'Semana acadêmica',
      kind: 'include',
      category: 'institucional',
      start: '2027-03-22',
      end: '2027-03-27',
    },
    {
      id: 's2',
      name: 'Reposição',
      kind: 'include',
      category: 'sabado',
      start: '2027-06-05',
      end: '2027-06-05',
    },
  ],
  offers: [
    {
      id: 'integrado',
      kind: 'integrado' as const,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
    },
  ],
};
const holiday: CalendarActivity = {
  id: 'holiday',
  name: 'Feriado municipal',
  kind: 'exclude',
  start: '2027-03-20',
  end: '2027-03-20',
};
const pick = (event?: CalendarActivity) => ({ name: event?.name });

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
  const next = updateSaturdayActivity(yearState, { id: 's1', name: '  Reposição ' }, []);
  assert.deepEqual(pick(next.events.find((e) => e.id === 's1')), { name: 'Reposição' });
  assert.equal(
    Object.hasOwn(
      next.events.find((e) => e.id === 's1')!,
      'evidence',
    ),
    false,
  );
  assert.throws(
    () => updateSaturdayActivity(yearState, { id: 'x', name: 'a' }, []),
    /não existe mais/,
  );
  assert.throws(
    () => updateSaturdayActivity(yearState, { id: 'semana', name: 'a' }, []),
    /Atividades e datas do campus/,
  );
  assert.throws(() => updateSaturdayActivity(yearState, { id: 's1', name: ' ' }, []), /atividade/);
});

test('a Saturday covered by a wider inclusion stays editable through its own record', () => {
  const own: CalendarActivity = {
    id: 's3',
    name: 'Gincana',
    kind: 'include',
    category: 'sabado',
    start: '2027-03-27',
    end: '2027-03-27',
  };
  const months = saturdayYear({ ...yearState, events: [...yearState.events, own] }, []);
  const saturday = months[2]!.days.find((day) => day.date === '2027-03-27') as YearSaturday;
  assert.deepEqual([saturday.registration?.id, saturday.editable], ['s3', true]);
});
