import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { semesterLink } from '../helpers/activity-links.ts';
import { configureIntakeRequirement } from '../../src/domain/calendar/commands/organization.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import type { ActivityState, AcademicTerm } from '../../src/domain/calendar/model.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 5 as const,
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
): ActivityState {
  return {
    ...state,
    offers: state.offers.map((item) =>
      item.id === offer
        ? { ...item, organization: term === 'annual' ? 'anual' : 'semestral' }
        : item,
    ),
    periods: [
      ...state.periods,
      {
        id,
        name: id,
        start: civilDate(start),
        end: civilDate(end),
        association: { status: 'defined', offers: [offer], term },
      },
    ],
  };
}

test('annual and semester periods of different offers survive normalization', () => {
  const annual = add(calendar(), 'integrado', 'annual', 'annual', '2027-02-01', '2027-12-17');
  const first = add(annual, 'graduacao', 'first', 'first', '2027-02-01', '2027-06-30');
  const second = add(first, 'graduacao', 'second', 'second', '2027-08-02', '2027-12-17');
  expect(normalizeOfferCalendar({ ...second, ignoredHistory: [] }).periods).toEqual(second.periods);
  expect(() =>
    normalizeOfferCalendar(add(second, 'integrado', 'annual', 'again', '2027-02-01', '2027-03-01')),
  ).toThrow('mais de um período');
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
    evaluatePlan(state).rows.find(
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

test('semester teacher deadlines stay valid when their offer changes to annual organization', () => {
  let state = calendar();
  state.offers = state.offers.map((offer) => ({
    ...offer,
    organization:
      offer.id === 'integrado' ? 'anual' : offer.id === 'graduacao' ? 'semestral' : 'a-classificar',
  }));
  state = add(state, 'graduacao', 'first', 'undergraduate-first', '2027-02-01', '2027-06-30');
  state.events = ['pit', 'rit', 'teaching-plan'].map((activityId) => ({
    id: `${activityId}-1`,
    activity: semesterLink(activityId, 'first'),
    name: `${activityId}-1`,
    start: civilDate('2027-04-01'),
    end: civilDate('2027-04-01'),
    effect: 'note',
    category: 'prazo',
    scope: { offers: ['graduacao'], confirmed: true },
  }));
  const annual = add(
    { ...state, periods: [] },
    'graduacao',
    'annual',
    'undergraduate-year',
    '2027-02-01',
    '2027-12-17',
  );
  expect(annual.offers.find((offer) => offer.id === 'graduacao')?.organization).toBe('anual');
  expect(linksToReview(annual)).toEqual(new Map());
});
