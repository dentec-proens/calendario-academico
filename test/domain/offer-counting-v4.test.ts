import { expect, test } from 'vitest';
import type { ActivityState, CalendarPeriod } from '../../src/domain/calendar/model.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { assessmentDayCounts } from '../../src/domain/calendar/counting/assessment-days.ts';
import { durationEnd, recalculatePeriods } from '../../src/domain/calendar/counting/duration.ts';
import { diagnoseCalendar, diagnoseTeachingDays } from '../../src/domain/calendar/diagnostics.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';

test('annual and semester undergraduate offers retain independent counting and minimums', () => {
  const state = calendarOffersV4Fixture();
  const before = structuredClone(state);
  const result = evaluateCalendar(state, state.events);
  expect(Object.keys(result.byOffer)).toEqual([
    'integrado',
    'graduacao',
    'graduacao-2',
    'graduacao-3',
  ]);
  expect(result.byOffer.graduacao.total).toBe(230);
  expect(result.byOffer['graduacao-2'].total).toBe(220);
  expect(result.byOffer['graduacao-3'].total).toBe(220);
  expect(result.byOffer.graduacao.byPeriod).toEqual({ 'graduacao-annual': 230 });
  expect(result.byOffer['graduacao-2'].byPeriod).toEqual({
    'graduacao-2-first': 115,
    'graduacao-2-second': 105,
  });
  const checks = diagnoseTeachingDays(state, result);
  expect(
    checks
      .filter((check) => check.offerId === 'graduacao')
      .map(({ scope, expected }) => ({ scope, expected })),
  ).toEqual([{ scope: 'annual', expected: 200 }]);
  expect(
    checks
      .filter((check) => check.offerId === 'graduacao-2')
      .map(({ scope, expected }) => ({ scope, expected })),
  ).toEqual([
    { scope: 'annual', expected: 200 },
    { scope: 'graduacao-2-first', expected: 100 },
    { scope: 'graduacao-2-second', expected: 100 },
  ]);
  expect(state).toEqual(before);
});

test('an exclusion uses the offer identity while minimums use that offer scope', () => {
  const state = calendarOffersV4Fixture();
  state.offers = state.offers.map((offer) =>
    offer.id === 'graduacao-3' ? { ...offer, scope: { status: 'own-regulation' } } : offer,
  );
  state.events.push({
    id: 'only-engineering',
    name: 'Impedimento exclusivo da engenharia',
    kind: 'exclude',
    offers: ['graduacao-2'],
    start: '2027-02-02',
    end: '2027-02-02',
  });
  const result = evaluateCalendar(state, state.events);
  expect(result.byOffer.graduacao.total).toBe(230);
  expect(result.byOffer['graduacao-2'].total).toBe(219);
  expect(result.byOffer['graduacao-3'].total).toBe(220);
  expect(result.byOffer['graduacao-2'].checks[0].expected).toBe(200);
  expect(result.byOffer['graduacao-3'].checks.every((check) => check.expected === null)).toBe(true);
});

test('assessment day counts select the suffixed offer and retain the annual ordinal', () => {
  const state = calendarOffersV4Fixture();
  expect(assessmentDayCounts(state, state.events)['graduacao-2-stage-1']).toEqual([
    { offerId: 'graduacao-2', days: 55, saturdays: 0, excluded: 0 },
  ]);
  expect(assessmentDayCounts(state, state.events)['graduacao-2-stage-4']).toEqual([
    { offerId: 'graduacao-2', days: 55, saturdays: 0, excluded: 0 },
  ]);
});

test('duration and period recalculation select only the period associated offers', () => {
  const fixture = calendarOffersV4Fixture();
  const period: CalendarPeriod = {
    id: 'engineering-duration',
    name: 'Período da engenharia',
    start: '2027-03-01',
    end: '2027-03-05',
    targetDays: 5,
    association: { status: 'defined', offers: ['graduacao-2'], term: 'first' },
  };
  const state = { ...fixture, periods: [period] };
  const events = [
    {
      id: 'engineering-exclusion',
      kind: 'exclude',
      start: '2027-03-02',
      end: '2027-03-02',
      offers: ['graduacao-2'],
    },
  ];
  expect(() => durationEnd('2027-03-01', 5, state, events)).toThrow(
    'As ofertas têm impedimentos diferentes',
  );
  expect(recalculatePeriods(state, events)[0].end).toBe('2027-03-08');
  expect(period.end).toBe('2027-03-05');
  expect(
    recalculatePeriods(
      { ...state, periods: [{ ...period, association: { status: 'a-classificar' as const } }] },
      events,
    )[0].end,
  ).toBe('2027-03-05');
});

test('structure and readiness name the incomplete offer instead of its shared kind', () => {
  const fixture = calendarOffersV4Fixture();
  const state = {
    ...fixture,
    periods: fixture.periods.filter((period) => period.id !== 'graduacao-2-second'),
    events: [],
  };
  expect(diagnoseCalendar(state).structure).toEqual([
    {
      code: 'period-count',
      offerId: 'graduacao-2',
      expected: 2,
      actual: 1,
    },
  ]);
  expect(readiness(state).issues).toContain(
    'Engenharia Elétrica — Cadastre os dois semestres letivos.',
  );
});

test('scope confirmation and window warnings follow each offer', () => {
  const state = calendarOffersV4Fixture();
  state.offers = state.offers.map((offer) =>
    offer.id === 'graduacao-2'
      ? { ...offer, scope: undefined }
      : offer.id === 'graduacao-3'
        ? { ...offer, scope: { status: 'own-regulation' } }
        : offer,
  );
  state.periods = state.periods.map((period) =>
    period.id === 'graduacao-3-first' || period.id === 'graduacao-2-first'
      ? { ...period, start: '2027-01-18' }
      : period,
  );
  const result = readiness(state);
  expect(result.issues.some((issue) => issue.startsWith('Engenharia Elétrica — Confirme'))).toBe(
    true,
  );
  expect(
    result.issues.some((issue) => issue.startsWith('Licenciatura em Química — Confirme')),
  ).toBe(false);
  expect(
    result.warnings.some((warning) => warning.startsWith('Engenharia Elétrica — Datas fora')),
  ).toBe(true);
  expect(
    result.warnings.some((warning) =>
      warning.startsWith('Tecnologia em Análise de Sistemas — Datas fora'),
    ),
  ).toBe(false);
});

test('an existing assessment stage outside its own semester remains a readiness warning', () => {
  const state = calendarOffersV4Fixture();
  state.events = state.events.map((event) =>
    event.requirementId === 'stage-1:graduacao-2'
      ? { ...event, start: '2027-08-02', end: '2027-08-06' }
      : event,
  );
  const result = readiness(state);
  expect(
    result.warnings.some(
      (warning) =>
        warning.startsWith('Engenharia Elétrica — 1ª etapa — 1º semestre:') &&
        warning.includes('semestre'),
    ),
  ).toBe(true);
  expect(result.issues.some((issue) => /stage-1:graduacao-2.*ciclo/.test(issue))).toBe(false);
});

function readiness(state: ActivityState) {
  return releaseReadiness(
    { id: 'synthetic', catalogueRevision: 1, institutionalSnapshot: [], state },
    { catalogue: { revision: 1 }, reviews: [] },
  );
}
