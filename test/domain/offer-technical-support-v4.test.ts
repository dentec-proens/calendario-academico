import { expect, test } from 'vitest';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';

const support = (state: ReturnType<typeof calendarOffersV4Fixture>) =>
  reviewSupport({ id: 'synthetic', name: 'Calendário sintético', version: 1, state }, state.events);

test('the parecer compares minima and window only for covered offers', () => {
  const state = calendarOffersV4Fixture();
  state.offers[3].scope = { status: 'own-regulation' };
  for (const period of state.periods.filter(
    (item) =>
      item.association.status === 'defined' && item.association.offers.includes('graduacao-3'),
  )) {
    period.start =
      period.association.status === 'defined' && period.association.term === 'first'
        ? '2027-01-01'
        : '2027-01-11';
    period.end =
      period.association.status === 'defined' && period.association.term === 'first'
        ? '2027-01-08'
        : '2027-01-15';
  }
  const actual = support(state);
  expect(actual.criteria.find((item) => item.id === 'annual')?.initial.finding).toBe(
    'CONTAGEM_ALCANCADA',
  );
  expect(actual.criteria.find((item) => item.id === 'semester')?.initial.status).toBe('ATENDIDO');
  expect(actual.criteria.find((item) => item.id === 'window')?.initial.status).toBe('ATENDIDO');
});

test('pending semester stages retain every assessment-dependent binding while other data is edited', () => {
  const state = {
    schemaVersion: 4 as const,
    year: 2027,
    campus: 'Campus sintético',
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
      },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'first',
        name: '1º semestre',
        start: '2027-02-01',
        end: '2027-07-09',
        association: { status: 'defined' as const, offers: ['graduacao'], term: 'first' as const },
      },
      {
        id: 'second',
        name: '2º semestre',
        start: '2027-07-26',
        end: '2027-12-17',
        association: { status: 'defined' as const, offers: ['graduacao'], term: 'second' as const },
      },
    ],
    events: ['stage', 'results', 'council', 'pedagogical-meeting'].map((prefix) => ({
      id: prefix,
      name: prefix,
      start: '2027-03-01',
      end: '2027-03-02',
      kind: 'note',
      offers: ['graduacao'],
      requirementId: `${prefix}-1:graduacao`,
    })),
  };
  const before = structuredClone(state);
  const saved = normalizeOfferCalendar(state);
  expect(saved.offers[0].stages).toBeUndefined();
  expect(saved.events.map((event) => event.requirementId)).toEqual(
    before.events.map((event) => event.requirementId),
  );
  expect(state).toEqual(before);
});

test('an offer with its own regulation does not change the semester criterion of a covered annual offer', () => {
  const state = calendarOffersV4Fixture();
  state.offers = state.offers.filter((offer) => ['graduacao', 'graduacao-3'].includes(offer.id));
  state.offers[1].scope = { status: 'own-regulation' };
  state.periods = state.periods.filter(
    (period) =>
      period.association.status === 'defined' &&
      period.association.offers.some((id) => state.offers.some((offer) => offer.id === id)),
  );
  state.events = [];
  const mixed = support(state).criteria.find((criterion) => criterion.id === 'semester')!;
  const annual = support({
    ...state,
    offers: state.offers.slice(0, 1),
    periods: state.periods.filter(
      (period) =>
        period.association.status === 'defined' && period.association.offers.includes('graduacao'),
    ),
  }).criteria.find((criterion) => criterion.id === 'semester')!;
  expect(mixed.initial).toEqual(annual.initial);
  expect(mixed.initial.status).toBe('NAO_APLICAVEL');
  expect(mixed.initial.finding).toBe('APLICABILIDADE');
});

test('coverage-linked candidates carry only the fields of the review contract', () => {
  const state = calendarOffersV4Fixture();
  const offer = state.offers[0].id;
  state.events.push({
    id: 'linked-stage',
    name: '1ª etapa de avaliação — início e término',
    start: '2027-02-15',
    end: '2027-05-17',
    kind: 'note',
    category: 'limite',
    offers: [offer],
    requirementId: `stage-1:${offer}`,
    assessmentAutoStart: '2027-02-15',
  });
  const candidates = support(state).criteria.flatMap((item) => item.candidates);
  expect(candidates.some((item) => item.id === 'linked-stage')).toBe(true);
  for (const item of candidates)
    expect(Object.keys(item).sort()).toEqual(['end', 'evidence', 'id', 'name', 'start']);
});
