import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import type { ActivityState, CalendarOffer } from '../../src/domain/calendar/model.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { durationEnd } from '../../src/domain/calendar/counting/duration.ts';
import { appliesTo } from '../../src/domain/calendar/modalities.ts';

const offers: CalendarOffer[] = [
  {
    id: 'curso-a',
    kind: 'graduacao',
    delivery: 'presencial',
    organization: 'anual',
    stages: { status: 'defined', perTerm: 2 },
  },
  {
    id: 'curso-b',
    kind: 'graduacao',
    delivery: 'ead',
    organization: 'anual',
    stages: { status: 'defined', perTerm: 2 },
  },
  {
    id: 'especializacao',
    kind: 'posgraduacao',
    delivery: 'presencial',
    organization: 'anual',
    stages: { status: 'defined', perTerm: 2 },
  },
];
const state: ActivityState = {
  year: 2027,
  offers,
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [
    {
      id: 'year',
      name: 'Período sintético',
      start: civilDate('2027-03-01'),
      end: civilDate('2027-03-05'),
      association: { status: 'defined', term: 'annual', offers: offers.map((offer) => offer.id) },
    },
  ],
  events: [],
};
const snapshot = {
  id: 'inst:synthetic',
  name: 'Impedimento institucional sintético',
  effect: 'exclude' as const,
  start: civilDate('2027-03-02'),
  end: civilDate('2027-03-02'),
  institutional: true,
  offers: ['curso-a', 'curso-b'],
  evidence: 'Fonte institucional sintética',
};

test('a persisted institutional snapshot reaches every offer it lists', () => {
  const before = structuredClone(snapshot);
  const counted = evaluateCalendar(state, [snapshot]);
  expect(
    Object.fromEntries(Object.entries(counted.byOffer).map(([id, result]) => [id, result.total])),
  ).toEqual({ 'curso-a': 4, 'curso-b': 4, especializacao: 5 });
  expect(snapshot).toEqual(before);
});

test('duration follows the offers the snapshot lists', () => {
  expect(durationEnd('2027-03-01', 5, { ...state, offers: [offers[0]] }, [snapshot])).toBe(
    '2027-03-08',
  );
  expect(durationEnd('2027-03-01', 5, { ...state, offers: [offers[2]] }, [snapshot])).toBe(
    '2027-03-05',
  );
});

test('the list decides, not the kind of the offer', () => {
  const listed = { ...snapshot, offers: ['curso-a'] };
  const counted = evaluateCalendar(state, [listed]);
  expect(counted.byOffer['curso-a'].total).toBe(4);
  expect(counted.byOffer['curso-b'].total).toBe(5);
  expect(counted.byOffer.especializacao.total).toBe(5);
});

test('a date reaches an offer only by its identity', () => {
  expect(appliesTo(snapshot, offers[0])).toBe(true);
  expect(appliesTo(snapshot, 'curso-b')).toBe(true);
  expect(appliesTo(snapshot, offers[2])).toBe(false);
  expect(appliesTo({ ...snapshot, offers: ['especializacao'] }, offers[0])).toBe(false);
  expect(appliesTo({ ...snapshot, offers: ['especializacao'] }, offers[2])).toBe(true);
});
