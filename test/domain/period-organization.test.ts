import { expect, test } from 'vitest';
import { applyPeriod } from '../../src/domain/calendar/commands/periods.ts';
import { configureIntakeRequirement } from '../../src/domain/calendar/commands/organization.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import type { ActivityState, AcademicTerm } from '../../src/domain/calendar/model.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [],
    events: [],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'a-classificar' as const,
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'a-classificar' as const,
      },
    ],
  };
}
function add(
  state: ActivityState,
  offer: string,
  term: AcademicTerm,
  id: string,
  start: string,
  end: string,
) {
  return applyPeriod(
    state,
    { name: id, start, end, days: '', association: { status: 'defined', offers: [offer], term } },
    [],
    () => id,
  );
}

test('periods declare annual and semester organization atomically and survive normalization', () => {
  const original = calendar();
  const annual = add(original, 'integrado', 'annual', 'annual', '2027-02-01', '2027-12-17');
  const first = add(annual, 'graduacao', 'first', 'first', '2027-02-01', '2027-06-30');
  const second = add(first, 'graduacao', 'second', 'second', '2027-08-02', '2027-12-17');
  expect(second.offers.map(({ id, organization }) => ({ id, organization }))).toEqual([
    { id: 'integrado', organization: 'anual' },
    { id: 'graduacao', organization: 'semestral' },
  ]);
  expect(normalizeOfferCalendar({ ...second, ignoredHistory: [] }).periods).toEqual(second.periods);
  expect(original.periods).toEqual([]);
  expect(original.offers[0].organization).toBe('a-classificar');
});

test('a conflicting cycle identifies the existing period without changing dates or declarations', () => {
  const annual = add(
    calendar(),
    'integrado',
    'annual',
    'Annual existente',
    '2027-02-01',
    '2027-12-17',
  );
  const original = structuredClone(annual);
  expect(() => add(annual, 'integrado', 'first', 'semester', '2027-02-01', '2027-06-30')).toThrow(
    'Annual existente',
  );
  expect(annual).toEqual(original);
});

test('unknown intake creates no configuration chore and an existing local requirement stays required', () => {
  const state: ActivityState = {
    ...calendar(),
    offers: calendar().offers.map((offer) => ({
      ...offer,
      organization: ({ integrado: 'anual', graduacao: 'semestral' }[offer.id] ??
        'a-classificar') as 'anual' | 'semestral' | 'a-classificar',
    })),
  };
  const registration = () =>
    activityCoverage(state).find(
      (row) => row.offerId === 'integrado' && row.requirement.id === 'registration-0',
    );
  expect(registration()?.applicability).toBe('optional');
  state.offers = state.offers.map((offer) => ({
    ...offer,
    intake: offer.id === 'integrado' ? { annual: { status: 'yes', required: true } } : undefined,
  }));
  expect(registration()?.applicability).toBe('required');
  expect(registration()?.coverage).toBe('pending');
});

test('a local requirement uses its explicit choice without sources and preserves the other offer and cycle', () => {
  const state = calendar();
  state.offers = state.offers.map((offer) => ({
    ...offer,
    organization:
      offer.id === 'integrado' ? 'anual' : offer.id === 'graduacao' ? 'semestral' : 'a-classificar',
  }));
  state.offers = state.offers.map((offer) => ({
    ...offer,
    intake: offer.id === 'integrado' ? { annual: { status: 'no' } } : undefined,
  }));
  const original = structuredClone(state);
  const configured = configureIntakeRequirement(state, 'graduacao', 'second', true);
  expect(configured.offers.find((offer) => offer.id === 'integrado')?.intake).toEqual({
    annual: { status: 'no' },
  });
  expect(configured.offers.find((offer) => offer.id === 'graduacao')?.intake?.second).toEqual({
    status: 'yes',
    required: true,
  });
  const optional = configureIntakeRequirement(configured, 'graduacao', 'second', false);
  expect(optional.offers.find((offer) => offer.id === 'graduacao')?.intake?.second).toEqual({
    status: 'yes',
    required: false,
  });
  expect(() => configureIntakeRequirement(state, 'graduacao', 'annual', true)).toThrow('ciclo');
  expect(state).toEqual(original);
});

test('editing a legacy period classifies it without changing its identity or dates', () => {
  const state = calendar();
  state.offers = state.offers.filter((offer) => offer.id === 'integrado');
  state.offers = state.offers.map((offer) => ({
    ...offer,
    organization: offer.id === 'integrado' ? 'a-classificar' : 'a-classificar',
  }));
  state.periods = [
    {
      id: 'legacy',
      name: 'Anual',
      start: '2027-02-01',
      end: '2027-12-17',
      association: { status: 'a-classificar' },
    },
  ];
  const classified = applyPeriod(
    state,
    {
      ...state.periods[0],
      name: 'Anual',
      days: '',
      association: { status: 'defined', offers: ['integrado'], term: 'annual' },
    },
    [],
    () => 'unused',
  );
  expect(classified.periods[0]).toMatchObject({
    id: 'legacy',
    start: '2027-02-01',
    end: '2027-12-17',
  });
  expect(classified.offers[0].organization).toBe('anual');
  expect(state.offers[0].organization).toBe('a-classificar');
});

test('preserved intake from an old cycle does not block periods of the current organization', () => {
  const state = calendar();
  state.offers = state.offers.map((offer) => ({
    ...offer,
    organization:
      offer.id === 'integrado'
        ? 'semestral'
        : offer.id === 'graduacao'
          ? 'semestral'
          : 'a-classificar',
  }));
  state.offers = state.offers.map((offer) => ({
    ...offer,
    intake: offer.id === 'integrado' ? { annual: { status: 'yes', required: true } } : undefined,
  }));
  const original = structuredClone(state);
  const applied = add(state, 'integrado', 'first', 'first', '2027-02-01', '2027-06-30');
  expect(applied.periods).toHaveLength(1);
  expect(applied.offers[0].intake).toEqual({ annual: { status: 'yes', required: true } });
  expect(state).toEqual(original);
  expect(() =>
    add(state, 'integrado', 'annual', 'annual', '2027-02-01', '2027-12-17'),
  ).not.toThrow();
  const annual: ActivityState = {
    ...state,
    offers: state.offers.map((offer) => ({
      ...offer,
      organization: ({ integrado: 'anual', graduacao: 'semestral' }[offer.id] ??
        'a-classificar') as 'anual' | 'semestral' | 'a-classificar',
    })),
  };
  expect(() => add(annual, 'integrado', 'first', 'first', '2027-02-01', '2027-06-30')).toThrow(
    'exigência local',
  );
});

test('changing a cycle rejects activity records that would lose their offer even when their ID remains', () => {
  let state = calendar();
  state.offers = state.offers.map((offer) => ({
    ...offer,
    organization:
      offer.id === 'integrado' ? 'anual' : offer.id === 'graduacao' ? 'anual' : 'a-classificar',
  }));
  state = add(state, 'integrado', 'annual', 'integrated-year', '2027-02-01', '2027-12-17');
  state = add(state, 'graduacao', 'annual', 'undergraduate-year', '2027-02-01', '2027-12-17');
  state.events = [
    {
      id: 'final-result',
      name: 'Resultado final da graduação',
      requirementId: 'final-0',
      start: '2027-12-17',
      end: '2027-12-17',
      kind: 'note',
      category: 'prazo',
      offers: ['graduacao'],
    },
  ];
  const original = structuredClone(state);
  const changed = {
    id: 'undergraduate-year',
    name: 'Primeiro semestre',
    start: '2027-02-01',
    end: '2027-06-30',
    days: '',
    association: { status: 'defined' as const, offers: ['graduacao'], term: 'first' as const },
  };
  expect(() => applyPeriod(state, changed, [], () => 'unused')).toThrow(
    'Resultado final da graduação',
  );
  expect(state).toEqual(original);
  state.events = [];
  expect(
    applyPeriod(state, changed, [], () => 'unused').offers.find((offer) => offer.id === 'graduacao')
      ?.organization,
  ).toBe('semestral');
});

test('semester teacher deadlines stay valid when their offer changes to annual organization', () => {
  let state = calendar();
  state.offers = state.offers.map((offer) => ({
    ...offer,
    organization:
      offer.id === 'integrado' ? 'anual' : offer.id === 'graduacao' ? 'semestral' : 'a-classificar',
  }));
  state = add(state, 'graduacao', 'first', 'undergraduate-first', '2027-02-01', '2027-06-30');
  state.events = ['pit-1', 'rit-1', 'teaching-plan-1'].map((requirementId) => ({
    id: requirementId,
    requirementId,
    name: requirementId,
    start: '2027-04-01',
    end: '2027-04-01',
    kind: 'note',
    category: 'prazo',
    offers: ['graduacao'],
  }));
  const applied = applyPeriod(
    state,
    {
      id: 'undergraduate-first',
      name: 'Ano letivo',
      start: '2027-02-01',
      end: '2027-12-17',
      days: '',
      association: { status: 'defined', offers: ['graduacao'], term: 'annual' },
    },
    [],
    () => 'unused',
  );
  expect(applied.offers.find((offer) => offer.id === 'graduacao')?.organization).toBe('anual');
  expect(applied.events).toEqual(state.events);
});
