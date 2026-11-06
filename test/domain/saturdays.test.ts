import { civilDate } from '../../src/domain/civil-date.ts';
import type { ActivityState, CalendarEvent } from '../../src/domain/calendar/model.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  monthSaturdays,
  saturdayEvents,
  saturdayOfferOptions,
  saturdaySelection,
  saturdayYear,
  type YearSaturday,
} from '../../src/domain/calendar/activities/saturdays.ts';
import { offerIds } from '../../src/domain/calendar/offers.ts';
import { evaluateCalendar as calendarResult } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  applySaturdayActivities,
  applySaturdays,
  updateSaturdayActivity,
} from '../../src/domain/calendar/commands/saturdays.ts';
import { validateActivityRecord } from '../../src/domain/calendar/activities/validation.ts';

test('a Saturday is available while any offer has a period on it and only no period blocks it', () => {
  const state = calendarOffersFixture();
  const day = (date: string, from = state) =>
    saturdayYear(from, [])
      .flatMap((month) => month.days)
      .find((day) => day.date === date) as YearSaturday;
  assert.equal(day('2027-03-06').status, 'available');
  assert.deepEqual(day('2027-03-06').offersOutOfPeriod, []);
  assert.equal(day('2027-01-02').status, 'outside');
  assert.deepEqual(day('2027-01-02').offersOutOfPeriod, offerIds(state));
  assert.throws(
    () => saturdayEvents(state, [civilDate('2027-01-02')], 'Atividade', () => 'saturday'),
    /fora dos períodos.*Técnico integrado.*Organização por oferta/,
  );
  // Another offer still has the date: only the offer left without periods stays out.
  const missing = {
    ...state,
    periods: state.periods.filter(
      (period) =>
        period.association.status !== 'defined' ||
        !period.association.offers.includes('graduacao-2'),
    ),
  };
  assert.equal(day('2027-03-06', missing).status, 'available');
  assert.deepEqual(day('2027-03-06', missing).offersOutOfPeriod, ['graduacao-2']);
  const [event] = saturdayEvents(missing, [civilDate('2027-03-06')], 'Atividade', () => 'saturday');
  assert.ok(!event!.offers.includes('graduacao-2'));
  assert.ok(event!.offers.includes('integrado'));
  // Without any period no offer can be reached, and the message names them all.
  assert.throws(
    () =>
      saturdayEvents(
        { ...state, periods: [] },
        [civilDate('2027-03-06')],
        'Atividade',
        () => 'saturday',
      ),
    /fora dos períodos/,
  );
});

test('month selection adds only chosen Saturdays, survives serialization, and respects conflicts', () => {
  const s = {
    schemaVersion: 6 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-03-31'),
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: [] as CalendarEvent[],
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
  s.events = saturdayEvents(
    s,
    [civilDate('2027-02-06'), civilDate('2027-02-20'), civilDate('2027-02-20')],
    'Sábado letivo',
    make,
  );
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(calendarResult(restored, restored.events).byWeekday[6], 2);
  assert.equal(saturdayEvents(s, [civilDate('2027-02-06')], 'Sábado', make).length, 0);
  const result = calendarResult(s, [
    ...s.events,
    {
      id: 'holiday',
      name: 'Feriado',
      start: civilDate('2027-02-20'),
      end: civilDate('2027-02-20'),
      effect: 'exclude',
      offers: ['integrado'],
    },
  ]);
  assert.equal(result.byWeekday[6], 1);
  assert.equal(result.conflicts.length, 1);
  assert.throws(() => saturdayEvents(s, [civilDate('2027-04-03')], 'Sábado', make), /fora/);
  assert.throws(() => saturdayEvents(s, [civilDate('2027-02-05')], 'Sábado', make), /sábados/);
  assert.throws(() => saturdayEvents(s, [civilDate('2027-02-27')], '', make), /atividade/);
});

test('a confirmed annual selection includes Saturdays from different months in one atomic command', () => {
  const state: ActivityState = {
    schemaVersion: 6 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
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
    dates: [civilDate('2027-03-06'), civilDate('2027-08-07'), civilDate('2027-03-06')],
    name: 'Atividades de reposição',
    confirmed: true,
  };
  let id = 0;
  const changed = applySaturdays(state, selected, () => String(++id));
  assert.deepEqual(
    changed.events.map((event) => event.start),
    [civilDate('2027-03-06'), civilDate('2027-08-07')],
  );
  assert.ok(changed.events.every((event) => !Object.hasOwn(event, 'evidence')));
  assert.equal(applySaturdays(changed, selected, () => String(++id)).events.length, 2);
  assert.deepEqual(state, original);
  assert.throws(
    () => applySaturdays(state, { ...selected, confirmed: false }, () => String(++id)),
    /Confirme/,
  );
  assert.throws(
    () =>
      applySaturdays(
        state,
        { ...selected, dates: [civilDate('2027-03-06'), civilDate('2027-01-02')] },
        () => String(++id),
      ),
    /fora dos períodos letivos/,
  );
  assert.deepEqual(state, original);
});

test('each Saturday keeps its activity and date without a source and a failed batch changes nothing', () => {
  const state: ActivityState = {
    schemaVersion: 6 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
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
    { date: civilDate('2027-03-06'), name: 'Feira de ciências' },
    { date: civilDate('2027-08-07'), name: 'Reposição de aulas' },
  ];
  let id = 0;
  const changed = applySaturdayActivities(state, activities, () => String(++id));
  assert.deepEqual(
    changed.events.map(({ start, name }) => ({ date: start, name })),
    activities,
  );
  assert.equal(applySaturdayActivities(changed, activities, () => String(++id)).events.length, 2);
  assert.throws(
    () =>
      applySaturdayActivities(state, [activities[0]!, { ...activities[1]!, name: '' }], () =>
        String(++id),
      ),
    /7 de agosto de 2027:.*atividade/,
  );
  assert.throws(
    () =>
      applySaturdayActivities(
        state,
        [activities[0]!, { ...activities[1]!, date: civilDate('2027-01-02') }],
        () => String(++id),
      ),
    /fora dos períodos/,
  );
  assert.throws(() => applySaturdayActivities(state, [], () => String(++id)), /Selecione/);
  assert.deepEqual(state, original);
});

const yearState: ActivityState = {
  schemaVersion: 6 as const,
  year: 2027,
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [
    {
      id: 'year',
      name: 'Ano',
      start: civilDate('2027-03-01'),
      end: civilDate('2027-03-31'),
      association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
    },
  ],
  events: [
    {
      id: 's1',
      name: 'Feira de ciências',
      effect: 'include',
      offers: ['integrado'],
      category: 'sabado',
      start: civilDate('2027-03-06'),
      end: civilDate('2027-03-06'),
    },
    {
      id: 'semana',
      name: 'Semana acadêmica',
      effect: 'include',
      offers: ['integrado'],
      category: 'institucional',
      start: civilDate('2027-03-22'),
      end: civilDate('2027-03-27'),
    },
    {
      id: 's2',
      name: 'Reposição',
      effect: 'include',
      offers: ['integrado'],
      category: 'sabado',
      start: civilDate('2027-06-05'),
      end: civilDate('2027-06-05'),
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
const holiday: CalendarEvent = {
  id: 'holiday',
  name: 'Feriado municipal',
  effect: 'exclude',
  offers: ['integrado'],
  start: civilDate('2027-03-20'),
  end: civilDate('2027-03-20'),
};
const pick = (event?: CalendarEvent) => ({ name: event?.name });

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
});

test('updating a Saturday activity trims values and rejects other records', () => {
  const next = updateSaturdayActivity(yearState, { id: 's1', name: '  Reposição ' });
  assert.deepEqual(pick(next.events.find((e) => e.id === 's1')), { name: 'Reposição' });
  assert.equal(
    Object.hasOwn(
      next.events.find((e) => e.id === 's1')!,
      'evidence',
    ),
    false,
  );
  assert.throws(() => updateSaturdayActivity(yearState, { id: 'x', name: 'a' }), /não existe mais/);
  assert.throws(
    () => updateSaturdayActivity(yearState, { id: 'semana', name: 'a' }),
    /Edite esta data no passo Atividades\./,
  );
  assert.throws(() => updateSaturdayActivity(yearState, { id: 's1', name: ' ' }), /atividade/);
});

test('a Saturday covered by a wider inclusion stays editable through its own record', () => {
  const own: CalendarEvent = {
    id: 's3',
    name: 'Gincana',
    effect: 'include',
    offers: ['integrado'],
    category: 'sabado',
    start: civilDate('2027-03-27'),
    end: civilDate('2027-03-27'),
  };
  const months = saturdayYear({ ...yearState, events: [...yearState.events, own] }, []);
  const saturday = months[2]!.days.find((day) => day.date === '2027-03-27') as YearSaturday;
  assert.deepEqual([saturday.registration?.id, saturday.editable], ['s3', true]);
});

/** The case of the UX review: integrated all year, undergraduate only within its semesters. */
const mixedState: ActivityState = {
  schemaVersion: 6 as const,
  year: 2027,
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [
    {
      id: 'year',
      name: 'Ano',
      start: civilDate('2027-02-01'),
      end: civilDate('2027-12-17'),
      association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
    },
    {
      id: 'first',
      name: '1º semestre',
      start: civilDate('2027-03-01'),
      end: civilDate('2027-07-09'),
      association: { status: 'defined' as const, offers: ['graduacao'], term: 'first' as const },
    },
    {
      id: 'second',
      name: '2º semestre',
      start: civilDate('2027-08-02'),
      end: civilDate('2027-12-17'),
      association: { status: 'defined' as const, offers: ['graduacao'], term: 'second' as const },
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
    {
      id: 'graduacao',
      kind: 'graduacao' as const,
      delivery: 'a-conferir' as const,
      organization: 'semestral' as const,
    },
  ],
};
const march = civilDate('2027-03-06');
const recess = civilDate('2027-07-17');
const days = (state: ActivityState, offer: string) =>
  calendarResult(state, state.events).byOffer[offer]!.checks[0]!.observed;
const makeId = (() => {
  let next = 0;
  return () => `new-${++next}`;
})();

test('a Saturday between the semesters stays available for the offer that has classes', () => {
  const saturday = saturdayYear(mixedState, [])
    .flatMap((month) => month.days)
    .find((day) => day.date === recess) as YearSaturday;
  assert.equal(saturday.status, 'available');
  assert.deepEqual(saturday.offersOutOfPeriod, ['graduacao']);
});

test('a Saturday for one offer leaves the count of the other offer unchanged', () => {
  const next = applySaturdayActivities(mixedState, [{ date: march, name: 'Reposição' }], makeId, [
    'graduacao',
  ]);
  assert.deepEqual(next.events[0]!.offers, ['graduacao']);
  assert.equal(days(next, 'graduacao'), days(mixedState, 'graduacao') + 1);
  assert.equal(days(next, 'integrado'), days(mixedState, 'integrado'));
});

test('each selected date reaches the marked offers that have a period on it', () => {
  const dates = [march, recess];
  const all = applySaturdayActivities(
    mixedState,
    dates.map((date) => ({ date, name: 'Reposição' })),
    makeId,
  );
  assert.deepEqual(
    all.events.map(({ start, offers }) => [start, offers]),
    [
      [march, ['integrado', 'graduacao']],
      [recess, ['integrado']],
    ],
  );
  // Whatever the selection, the result passes the check of any date of the calendar.
  for (const event of all.events) validateActivityRecord(all, event);
  const preview = saturdaySelection(mixedState, dates, ['integrado', 'graduacao']);
  assert.deepEqual(preview.unreached, []);
  assert.deepEqual(
    preview.offers.find((offer) => offer.id === 'graduacao'),
    {
      id: 'graduacao',
      reached: [march],
      outOfPeriod: [recess],
    },
  );
});

test('a date that no marked offer reaches refuses the batch instead of being dropped', () => {
  const batch = [march, recess].map((date) => ({ date, name: 'Reposição' }));
  assert.deepEqual(saturdaySelection(mixedState, [march, recess], ['graduacao']).unreached, [
    recess,
  ]);
  assert.throws(
    () => applySaturdayActivities(mixedState, batch, makeId, ['graduacao']),
    /nenhuma oferta marcada.*Técnico integrado/,
  );
  assert.throws(() => applySaturdayActivities(mixedState, batch, makeId, []), /Marque ao menos/);
});

test('editing a Saturday changes its offers under the rules of the selection', () => {
  const state = applySaturdayActivities(mixedState, [{ date: march, name: 'Reposição' }], makeId, [
    'integrado',
  ]);
  const { id } = state.events[0]!;
  const widened = updateSaturdayActivity(state, {
    id,
    name: 'Reposição',
    offers: ['integrado', 'graduacao'],
  });
  assert.deepEqual(widened.events[0]!.offers, ['integrado', 'graduacao']);
  assert.equal(days(widened, 'graduacao'), days(mixedState, 'graduacao') + 1);
  const narrowed = updateSaturdayActivity(widened, {
    id,
    name: 'Reposição',
    offers: ['graduacao'],
  });
  assert.equal(days(narrowed, 'integrado'), days(mixedState, 'integrado'));
  assert.throws(() => updateSaturdayActivity(state, { id, name: 'a', offers: [] }), /Marque/);

  const inRecess = applySaturdayActivities(mixedState, [{ date: recess, name: 'Feira' }], makeId);
  assert.throws(
    () =>
      updateSaturdayActivity(inRecess, {
        id: inRecess.events[0]!.id,
        name: 'Feira',
        offers: ['integrado', 'graduacao'],
      }),
    /Graduação: sem período letivo nesta data/,
  );
});

test('a Saturday keeps its stored offers until they change, even when a period moved away', () => {
  const stale: ActivityState = {
    ...mixedState,
    events: [
      {
        id: 'stored',
        name: 'Feira',
        effect: 'include',
        category: 'sabado',
        start: recess,
        end: recess,
        offers: ['integrado', 'graduacao'],
      },
    ],
  };
  // Renaming alone does not touch the list; correcting it means leaving the offer out.
  const renamed = updateSaturdayActivity(stale, { id: 'stored', name: 'Gincana' });
  assert.deepEqual(pick(renamed.events[0]), { name: 'Gincana' });
  assert.deepEqual(renamed.events[0]!.offers, ['integrado', 'graduacao']);
  const corrected = updateSaturdayActivity(stale, {
    id: 'stored',
    name: 'Feira',
    offers: ['integrado'],
  });
  assert.deepEqual(corrected.events[0]!.offers, ['integrado']);
  assert.deepEqual(saturdayOfferOptions(stale, stale.events[0]!), [
    { id: 'integrado', inPeriod: true },
    { id: 'graduacao', inPeriod: false },
  ]);
});

test('an offer another inclusion already covers on the date is not added to the Saturday', () => {
  const state: ActivityState = {
    ...mixedState,
    events: [
      {
        id: 'tecnico',
        name: 'Feira',
        effect: 'include',
        category: 'sabado',
        start: march,
        end: march,
        offers: ['integrado'],
      },
      {
        id: 'graduacao',
        name: 'Gincana',
        effect: 'include',
        category: 'sabado',
        start: march,
        end: march,
        offers: ['graduacao'],
      },
    ],
  };
  assert.deepEqual(saturdayOfferOptions(state, state.events[0]!), [
    { id: 'integrado', inPeriod: true },
    { id: 'graduacao', inPeriod: true, coveredBy: 'Gincana' },
  ]);
  assert.throws(
    () =>
      updateSaturdayActivity(state, {
        id: 'tecnico',
        name: 'Feira',
        offers: ['integrado', 'graduacao'],
      }),
    /Graduação já tem “Gincana”/,
  );
});

test('an exclusion of part of the offers names them among the impediments', () => {
  const months = saturdayYear(mixedState, [
    {
      effect: 'exclude',
      name: 'Recesso',
      start: march,
      end: march,
      offers: ['graduacao'],
    },
    {
      effect: 'exclude',
      name: 'Feriado',
      start: march,
      end: march,
      offers: ['integrado', 'graduacao'],
    },
  ]);
  const saturday = months[2]!.days.find((day) => day.date === march)!;
  assert.deepEqual(saturday.impediments, ['Recesso (Graduação)', 'Feriado']);
});
