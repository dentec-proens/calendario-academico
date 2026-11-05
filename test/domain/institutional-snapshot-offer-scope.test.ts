import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import type { ActivityState, CalendarOffer } from '../../src/domain/calendar/model.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

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
