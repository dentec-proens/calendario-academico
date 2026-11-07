import { describe, expect, test } from 'vitest';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import {
  coincidentDays,
  isVacationActivity,
  startsDecemberVacation,
  vacationDates,
  vacationDateIssue,
  vacationDays,
  vacationEditIssue,
  vacationRef,
  type VacationKind,
} from '../../src/domain/calendar/activities/vacations.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import {
  activityChangeOptions,
  changeActivity,
  createCampusDate,
  removeEvent,
} from '../../src/domain/calendar/commands/events.ts';
import {
  copySchoolVacationsToTeachers,
  replaceTeacherVacations,
  saveVacationPeriod,
} from '../../src/domain/calendar/commands/vacations.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { vacationRemovedDays } from '../../src/domain/calendar/counting/vacation-days.ts';
import type {
  CalendarContent,
  CalendarEvent,
  CalendarOffer,
  OfferKind,
} from '../../src/domain/calendar/model.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { groupPendencies } from '../../src/domain/calendar/pendencies.ts';
import { contentIssues } from '../../src/domain/calendar/readiness.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';

type State = CalendarContent & { year: number; campus: string };

const offer = (kind: OfferKind): CalendarOffer => ({
  id: kind,
  kind,
  delivery: 'presencial',
  organization: 'anual',
  stages: { status: 'defined', perTerm: 2 },
  scope: { status: 'covered' },
});

function calendar(kinds: OfferKind[] = ['integrado', 'graduacao'], year = 2027): State {
  return {
    schemaVersion: 7,
    year,
    campus: 'Exemplo',
    offers: kinds.map(offer),
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano letivo',
        start: civilDate(`${year}-02-01`),
        end: civilDate(`${year}-12-17`),
        association: { status: 'defined', offers: kinds, term: 'annual' },
      },
    ],
    events: [],
  };
}

let sequence = 0;
const ids = () => `period-${++sequence}`;

function period(
  state: State,
  kind: VacationKind,
  start: string,
  end: string,
  extra: { name?: string; offers?: string[]; id?: string } = {},
) {
  return saveVacationPeriod(state, kind, {
    id: extra.id ?? ids(),
    start: civilDate(start),
    end: civilDate(end),
    ...(extra.name ? { name: extra.name } : {}),
    ...(extra.offers ? { offers: extra.offers } : {}),
  });
}

const rows = (state: State, kind: VacationKind) =>
  evaluatePlan(state).rows.filter(
    (row) => row.requirement.activity.activityId === `${kind}-vacation`,
  );

const withEvent = (state: State, event: Partial<CalendarEvent> & { id: string }): State => ({
  ...state,
  events: [
    ...state.events,
    {
      name: 'Data',
      start: civilDate('2027-07-05'),
      end: civilDate('2027-07-09'),
      effect: 'exclude',
      offers: state.offers.map(({ id }) => id),
      ...event,
    },
  ],
});

describe('the rules of a vacation period', () => {
  test('both kinds leave the count, with the category of vacations', () => {
    for (const kind of ['school', 'teacher'] as const) {
      const [date] = period(calendar(), kind, '2027-07-05', '2027-07-20').events;
      expect(date).toMatchObject({
        effect: 'exclude',
        category: 'ferias',
        activity: vacationRef(kind),
      });
    }
  });

  test('teacher vacations reach every offer, post-graduate included, with a generated name', () => {
    const state = calendar(['integrado', 'posgraduacao']);
    const [date] = period(state, 'teacher', '2027-07-05', '2027-07-19', {
      name: 'Outro nome',
      offers: ['integrado'],
    }).events;
    expect(date).toMatchObject({
      name: 'Férias docentes — 15 dias',
      offers: ['integrado', 'posgraduacao'],
    });
  });

  test('school vacations choose their offers and may be named', () => {
    const named = period(calendar(), 'school', '2027-07-05', '2027-07-19', {
      name: 'Recesso escolar',
      offers: ['integrado'],
    }).events[0];
    expect(named).toMatchObject({ name: 'Recesso escolar', offers: ['integrado'] });
    expect(period(calendar(), 'school', '2027-07-05', '2027-07-19').events[0]).toMatchObject({
      name: 'Férias escolares',
      offers: ['integrado', 'graduacao'],
    });
  });

  test('a period stays inside the calendar year', () => {
    expect(() => period(calendar(), 'teacher', '2027-12-20', '2028-01-20')).toThrow();
    expect(() => period(calendar(), 'school', '2026-12-20', '2027-01-20')).toThrow();
  });

  test('periods of one kind overlap neither in a shared offer nor for the teachers', () => {
    const first = period(calendar(), 'school', '2027-07-05', '2027-07-20', {
      offers: ['integrado'],
    });
    expect(() =>
      period(first, 'school', '2027-07-20', '2027-07-25', { offers: ['integrado'] }),
    ).toThrow(/sobrepor/);
    expect(
      period(first, 'school', '2027-07-10', '2027-07-25', { offers: ['graduacao'] }).events,
    ).toHaveLength(2);
    const teachers = period(calendar(), 'teacher', '2027-07-05', '2027-07-20');
    expect(() => period(teachers, 'teacher', '2027-07-20', '2027-07-25')).toThrow(/sobrepor/);
    // The two kinds coincide freely.
    expect(period(teachers, 'school', '2027-07-05', '2027-07-20').events).toHaveLength(2);
  });

  test('editing keeps the kind, and one period is removed alone', () => {
    const state = period(
      period(calendar(), 'teacher', '2027-01-04', '2027-01-20', { id: 'a' }),
      'teacher',
      '2027-07-05',
      '2027-07-20',
      { id: 'b' },
    );
    expect(() => period(state, 'school', '2027-03-01', '2027-03-02', { id: 'a' })).toThrow(
      /não pertence/,
    );
    const edited = period(state, 'teacher', '2027-01-04', '2027-01-10', { id: 'a' });
    expect(edited.events.find((event) => event.id === 'a')?.name).toBe('Férias docentes — 7 dias');
    expect(removeEvent(state, 'a').events.map((event) => event.id)).toEqual(['b']);
  });

  test('a new or edited linked date with another effect or category is refused on saving', () => {
    const state = calendar();
    for (const change of [{ effect: 'note' as const }, { effect: 'include' as const }])
      expect(() =>
        normalizeOfferCalendar(
          withEvent(state, {
            id: 'v',
            category: 'ferias',
            activity: vacationRef('school'),
            ...change,
          }),
        ),
      ).toThrow(/contagem/);
    expect(() =>
      normalizeOfferCalendar(
        withEvent(state, { id: 'v', category: 'recesso', activity: vacationRef('school') }),
      ),
    ).toThrow(/categoria/);
  });

  test('a saved date that breaks the rules does not block other changes: it is a pendency', () => {
    const state = withEvent(calendar(), {
      id: 'v',
      effect: 'note',
      category: 'ferias',
      activity: vacationRef('school'),
    });
    expect(() => normalizeOfferCalendar({ ...state, weekdays: [1, 2, 3, 4] }, state)).not.toThrow();
    expect(contentIssues(state, []).map((issue) => issue.code)).toContain('vacation:v');
  });

  test('a date of the campus cannot be a vacation; a saved one stays and is a pendency', () => {
    const date = {
      id: 'c',
      name: 'Férias',
      start: civilDate('2027-07-05'),
      end: civilDate('2027-07-09'),
      effect: 'note' as const,
      category: 'ferias',
      offers: ['integrado'],
    };
    expect(() => createCampusDate(calendar(), date)).toThrow(/passo Férias/);
    const state = withEvent(calendar(), date);
    expect(() => normalizeOfferCalendar(state)).toThrow(/passo Férias/);
    expect(() => normalizeOfferCalendar({ ...state, weekdays: [1, 2, 3, 4] }, state)).not.toThrow();
    expect(contentIssues(state, []).find((issue) => issue.code === 'vacation:c')?.target).toEqual({
      area: 'date',
      eventId: 'c',
      name: 'Férias',
    });
  });

  test('saving extends teacher vacations to an offer added later, and never school ones', () => {
    const state = period(
      period(calendar(['integrado']), 'teacher', '2027-01-04', '2027-01-18', { id: 't' }),
      'school',
      '2027-07-05',
      '2027-07-19',
      { id: 's' },
    );
    const added = {
      ...state,
      offers: [...state.offers, offer('graduacao')],
      periods: state.periods.map((item) => ({
        ...item,
        association: { ...item.association, offers: ['integrado', 'graduacao'] },
      })),
    };
    const saved = normalizeOfferCalendar(added, state);
    expect(saved.events.find((event) => event.id === 't')?.offers).toEqual([
      'integrado',
      'graduacao',
    ]);
    expect(saved.events.find((event) => event.id === 's')?.offers).toEqual(['integrado']);
  });
});

describe('copying between the kinds', () => {
  test('uses the school periods of one offer, independent from then on', () => {
    const state = period(
      period(calendar(), 'school', '2027-01-04', '2027-01-20', { offers: ['integrado'] }),
      'school',
      '2027-07-05',
      '2027-07-20',
      { offers: ['graduacao'] },
    );
    const next = copySchoolVacationsToTeachers(state, 'integrado', ids);
    const teachers = vacationDates(next.events, 'teacher');
    expect(teachers.map(({ start }) => start)).toEqual(['2027-01-04']);
    expect(teachers[0]?.offers).toEqual(['integrado', 'graduacao']);
    expect(vacationDates(next.events, 'school')).toHaveLength(2);
  });

  test('replacing teacher vacations leaves the school ones', () => {
    const state = period(
      period(calendar(), 'school', '2027-01-04', '2027-01-20'),
      'teacher',
      '2027-07-05',
      '2027-07-20',
    );
    const next = replaceTeacherVacations(
      state,
      [{ start: civilDate('2027-03-01'), end: civilDate('2027-03-02') }],
      ids,
    );
    expect(vacationDates(next.events, 'teacher').map(({ start }) => start)).toEqual(['2027-03-01']);
    expect(vacationDates(next.events, 'school')).toHaveLength(1);
  });
});

describe('what the norm of 2027 asks for', () => {
  const teachers = (end: string) => period(calendar(), 'teacher', '2027-01-01', end);

  test('exactly 45 teacher days complete the activity; 44 and 46 are a pendency', () => {
    expect(
      rows(teachers('2027-02-14'), 'teacher').every((row) => row.coverage === 'complete'),
    ).toBe(true);
    for (const [end, days] of [
      ['2027-02-13', 44],
      ['2027-02-15', 46],
    ] as const) {
      const state = teachers(end);
      expect(rows(state, 'teacher')[0]).toMatchObject({
        coverage: 'partial',
        issues: [`Registre exatamente 45 dias no ano do calendário; há ${days}.`],
      });
      expect(
        contentIssues(state, []).some((issue) => issue.detail.includes('Registre exatamente')),
      ).toBe(true);
    }
  });

  test('the days add up across the periods, each day once', () => {
    const state = period(
      period(teachers('2027-01-20'), 'teacher', '2027-07-05', '2027-07-20'),
      'teacher',
      '2027-12-23',
      '2027-12-31',
    );
    expect(vacationDays(vacationDates(state.events, 'teacher'))).toBe(45);
    expect(rows(state, 'teacher').every((row) => row.coverage === 'complete')).toBe(true);
  });

  test('the absence of either kind is one pendency, whatever the number of offers', () => {
    const items = groupPendencies(contentIssues(calendar(), []), calendar());
    for (const kind of ['school', 'teacher'] as const)
      expect(
        items.filter((item) => item.key === `activity:${activityKey(vacationRef(kind))}`),
      ).toEqual([
        expect.objectContaining({
          offerIds: ['integrado', 'graduacao'],
          target: { area: 'activity', activity: vacationRef(kind) },
        }),
      ]);
  });

  test('one school period covering every offer is enough, without a number of periods', () => {
    const state = period(calendar(), 'school', '2027-07-05', '2027-07-06');
    expect(rows(state, 'school').map((row) => row.coverage)).toEqual(['complete', 'complete']);
  });

  test('each offer needs its school vacations', () => {
    const state = period(calendar(), 'school', '2027-07-05', '2027-07-06', {
      offers: ['integrado'],
    });
    expect(rows(state, 'school').map((row) => [row.offerId, row.coverage])).toEqual([
      ['integrado', 'complete'],
      ['graduacao', 'pending'],
    ]);
  });

  test('a post-graduate calendar, outside the norm, has neither a pendency nor a total to meet', () => {
    const state = period(calendar(['posgraduacao']), 'teacher', '2027-01-01', '2027-01-10');
    expect(
      contentIssues(state, []).filter((issue) => /vacation|Férias/.test(issue.code + issue.detail)),
    ).toEqual([]);
    expect(rows(state, 'teacher')[0]).toMatchObject({ applicability: 'unconfigured', issues: [] });
  });

  test('a year without a norm generates the activities, optional and with no total', () => {
    const state = period(calendar(['integrado'], 2028), 'teacher', '2028-01-01', '2028-01-10');
    expect(evaluatePlan(state).links.issues.size).toBe(0);
    expect(
      contentIssues(state, []).filter((issue) => issue.detail.includes('Registre exatamente')),
    ).toEqual([]);
  });
});

describe('counting', () => {
  const total = (state: State, offerId: string) =>
    evaluateCalendar(state, state.events).byOffer[offerId]!.total;

  test('July inside an annual period leaves the count; only the offers of the date', () => {
    const state = calendar();
    const next = period(state, 'school', '2027-07-05', '2027-07-09', { offers: ['integrado'] });
    expect(total(next, 'integrado')).toBe(total(state, 'integrado') - 5);
    expect(total(next, 'graduacao')).toBe(total(state, 'graduacao'));
  });

  test('marked for every offer, it also takes days from the other offer', () => {
    const state = calendar();
    const next = period(state, 'school', '2027-07-05', '2027-07-09');
    expect(total(next, 'graduacao')).toBe(total(state, 'graduacao') - 5);
  });

  test('a school Saturday inside the vacations is a conflict and does not count', () => {
    const state = withEvent(period(calendar(), 'school', '2027-07-05', '2027-07-20'), {
      id: 'sat',
      name: 'Sábado',
      start: civilDate('2027-07-10'),
      end: civilDate('2027-07-10'),
      effect: 'include',
      category: 'sabado',
    });
    const result = evaluateCalendar(state, state.events).byOffer.integrado!;
    expect(result.conflicts).toEqual([expect.objectContaining({ date: '2027-07-10' })]);
    expect(result.ledger.find((entry) => entry.date === '2027-07-10')?.counted).toBe(false);
  });

  test('the days a period removes, by offer, ignoring the period itself', () => {
    const state = period(calendar(), 'school', '2027-07-05', '2027-07-09', { id: 'p' });
    const date = state.events[0]!;
    expect(vacationRemovedDays(state, state.events, date)).toEqual([
      { offerId: 'integrado', days: 5 },
      { offerId: 'graduacao', days: 5 },
    ]);
    // Outside the school period nothing is removed.
    expect(
      vacationRemovedDays(state, state.events, {
        ...date,
        id: 'q',
        start: civilDate('2027-01-04'),
        end: civilDate('2027-01-08'),
      }),
    ).toEqual([
      { offerId: 'integrado', days: 0 },
      { offerId: 'graduacao', days: 0 },
    ]);
    // A day another date already removed is not the period's.
    const holiday = withEvent(state, {
      id: 'h',
      start: civilDate('2027-07-05'),
      end: civilDate('2027-07-05'),
      category: 'feriado',
    });
    expect(vacationRemovedDays(holiday, holiday.events, date)?.[0]?.days).toBe(4);
  });

  test('the days a period removes are unknown while the calendar cannot be counted', () => {
    const state = calendar();
    const broken = { ...state, periods: [{ ...state.periods[0]!, end: civilDate('2028-01-10') }] };
    expect(
      vacationRemovedDays(broken, [], {
        id: 'p',
        start: civilDate('2027-07-05'),
        end: civilDate('2027-07-09'),
        offers: ['integrado'],
      }),
    ).toBeUndefined();
  });
});

describe('coincidence', () => {
  test('is measured by offer, and partial is a number, never a problem', () => {
    const state = period(
      period(
        period(calendar(), 'teacher', '2027-07-01', '2027-07-20'),
        'school',
        '2027-07-05',
        '2027-07-14',
        { offers: ['integrado'] },
      ),
      'school',
      '2027-07-01',
      '2027-07-31',
      { offers: ['graduacao'] },
    );
    expect(coincidentDays(state.events, 'integrado')).toBe(10);
    expect(coincidentDays(state.events, 'graduacao')).toBe(20);
    expect(contentIssues(state, []).some((issue) => /coincid/i.test(issue.detail))).toBe(false);
  });
});

describe('printing', () => {
  const printed = (state: State) =>
    proensLayout(state, state.events, evaluateCalendar(state, state.events));

  test('a period to the end of December prints where it starts; the grid marks every day', () => {
    const state = period(calendar(), 'school', '2027-12-23', '2027-12-31');
    expect(startsDecemberVacation(state.events[0]!, 2027)).toBe(true);
    const html = printed(state);
    expect(html).toContain('<td class="cat-ferias">23</td><td>Início das férias escolares');
    expect(html).not.toContain('23 a 31');
    const december = html.slice(html.search(/>\s*dezembro/i));
    for (const day of [23, 31])
      expect(december).toMatch(new RegExp(`class="[^"]*cat-ferias[^"]*"[^>]*>\\s*${day}\\b`));
    expect(vacationDays(state.events)).toBe(9);
  });

  test('January prints as usual', () => {
    const html = printed(period(calendar(), 'school', '2027-01-01', '2027-01-20'));
    expect(html).toContain('<td class="cat-ferias">1 a 20</td><td>Férias escolares');
  });

  test('a period that starts before December keeps the listing by month', () => {
    const html = printed(period(calendar(), 'school', '2027-11-20', '2027-12-31'));
    expect(html).toContain('<td class="cat-ferias">20 a 30</td><td>Férias escolares');
    expect(html).toContain('<td class="cat-ferias">1 a 31</td><td>Férias escolares');
  });

  test('a period that ends before the last day of the year keeps its range', () => {
    const html = printed(period(calendar(), 'school', '2027-12-20', '2027-12-30'));
    expect(html).toContain('<td class="cat-ferias">20 a 30</td><td>Férias escolares');
  });

  test('a named school period and the teacher one say where they start', () => {
    expect(
      printed(
        period(calendar(), 'school', '2027-12-23', '2027-12-31', { name: 'Recesso escolar' }),
      ),
    ).toContain('<td>Início: Recesso escolar');
    expect(printed(period(calendar(), 'teacher', '2027-12-23', '2027-12-31'))).toContain(
      '<td>Início das férias docentes — 9 dias',
    );
  });

  test('the same dates print once when the line says no more than the data', () => {
    const both = (extra: { name?: string; offers?: string[] } = {}, start = '2027-07-05') =>
      period(
        period(calendar(), 'teacher', start, start.replace(/\d\d$/, '20')),
        'school',
        start,
        start.replace(/\d\d$/, '20'),
        extra,
      );
    const merged = printed(both());
    expect(merged).toContain('<td>Férias escolares e docentes — 16 dias');
    expect(merged).not.toContain('<td>Férias docentes');
    // A name of its own or part of the offers keeps two lines.
    for (const extra of [{ name: 'Recesso escolar' }, { offers: ['integrado'] }]) {
      const html = printed(both(extra));
      expect(html).toContain('<td>Férias docentes — 16 dias');
      expect(html).not.toContain('escolares e docentes');
    }
    const december = period(
      period(calendar(), 'teacher', '2027-12-23', '2027-12-31'),
      'school',
      '2027-12-23',
      '2027-12-31',
    );
    expect(printed(december)).toContain('<td>Início das férias escolares e docentes — 9 dias');
  });
});

describe('the evidence of the review', () => {
  const support = (state: State) =>
    reviewSupport({ id: 'c', name: 'Teste', version: 1, state }, state.events);
  const criterion = (state: State, id: string) =>
    support(state).criteria.find((item) => item.id === id)!;

  test('criterion III shows coverage, and a date of the campus stays apart as a candidate', () => {
    const state = withEvent(period(calendar(), 'school', '2027-07-05', '2027-07-20', { id: 'p' }), {
      id: 'both',
      name: 'Férias escolares e docentes',
      category: 'feriado',
    });
    const iii = criterion(state, 'III');
    expect(iii.evidence.kind).toBe('coverage');
    expect(iii.linkedRecords.map((record) => record.id)).toEqual(['p']);
    expect(iii.candidates.map((record) => record.id)).toEqual(['both']);
  });

  test('criterion IV computes the total and the coincidence, as information', () => {
    const state = period(
      period(calendar(), 'teacher', '2027-07-01', '2027-07-20'),
      'school',
      '2027-07-05',
      '2027-07-14',
    );
    const iv = criterion(state, 'IV');
    expect(iv.evidence.kind).toBe('coverage');
    expect(iv.toCheck).toEqual(
      expect.arrayContaining([
        'Total das férias docentes no ano: 20 dias.',
        'Coincidem com as férias escolares: 10 dias (orientação; a parcial é válida).',
      ]),
    );
    expect(iv.suggestion).toBeNull();
  });

  test('coincidence that differs by offer names each one', () => {
    const state = period(
      period(calendar(), 'teacher', '2027-07-01', '2027-07-20'),
      'school',
      '2027-07-05',
      '2027-07-14',
      { offers: ['integrado'] },
    );
    expect(criterion(state, 'IV').toCheck.join(' ')).toContain('dias; ');
  });
});

test('correcting a link never turns a date into vacations: the count and the offers would change', () => {
  const state = calendar();
  const saved: CalendarEvent = {
    id: 'under-review',
    name: 'Data a conferir',
    start: civilDate('2027-03-01'),
    end: civilDate('2027-03-02'),
    effect: 'note',
    offers: state.offers.map((offer) => offer.id),
    activity: { activityId: 'diary', term: 'first' } as never,
  };
  const next = { ...state, events: [saved] };
  expect(
    activityChangeOptions(next, saved.id).some((row) => isVacationActivity(row.activity)),
  ).toBe(false);
  expect(() => changeActivity(next, saved.id, vacationRef('school'))).toThrow(/passo Férias/);
});

test('a saved vacation of the campus blocks the submission, never another save', () => {
  const state = calendar();
  const offers = state.offers.map((offer) => offer.id);
  const old: CalendarEvent = {
    id: 'old-vacation',
    name: 'Férias antigas',
    start: civilDate('2027-07-05'),
    end: civilDate('2027-07-10'),
    effect: 'exclude',
    category: 'ferias',
    offers,
  };
  expect(vacationEditIssue(state, old, old)).toBeUndefined();
  expect(vacationEditIssue(state, undefined, old)).toMatch(/passo Férias/);
  expect(vacationDateIssue(state, old)).toMatch(/passo Férias/);
});
