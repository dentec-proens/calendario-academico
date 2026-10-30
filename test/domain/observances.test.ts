import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { expect, test } from 'vitest';
import { inheritedEvents, initialCatalogue } from '../../src/domain/institution/catalogue.ts';
import {
  applyObservances,
  calendarObservances,
  chooseObservance,
  observanceIssues,
  validateObservances,
  validateObservanceCatalogueEvent,
} from '../../src/domain/calendar/observances.ts';
import { durationEnd } from '../../src/domain/calendar/counting/duration.ts';
import { inspect } from '../../src/domain/calendar/base.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { teacherDayId, publicServantDayId } from '../fixtures/observances.ts';

const offers = [
  { id: 'course', kind: 'integrado', delivery: 'presencial', organization: 'anual' },
] as const;
const state = { year: 2027, offers: [...offers], weekdays: [1, 2, 3, 4, 5], weekConfirmed: true };
const base = () => inheritedEvents(initialCatalogue(), state.year, state.offers);

test('Professor preserves all seven options, Servidor accepts exactly the two declared dates', () => {
  for (const day of [11, 12, 13, 14, 15, 16, 17]) {
    const chosen = chooseObservance(state, 'teacher-day', `2027-10-${day}`, base());
    expect(applyObservances(base(), chosen).find((event) => event.id === teacherDayId)?.start).toBe(
      `2027-10-${day}`,
    );
  }
  for (const day of [28, 29])
    expect(() =>
      chooseObservance(state, 'public-servant-day', `2027-10-${day}`, base()),
    ).not.toThrow();
  for (const date of ['2027-10-27', '2027-10-30', '2027-11-01', '2027-11-02', '2028-10-28'])
    expect(() => chooseObservance(state, 'public-servant-day', date, base())).toThrow();
  for (const date of ['2027-10-10', '2027-10-18', '2027-02-30'])
    expect(() => chooseObservance(state, 'teacher-day', date, base())).toThrow();
});

test('choices are local, explicit reference dates remain pinned, restoring removes only the selected choice', () => {
  const teacher = chooseObservance(state, 'teacher-day', '2027-10-15', base());
  expect(teacher.observanceDates).toEqual({ 'teacher-day': '2027-10-15' });
  const both = chooseObservance(teacher, 'public-servant-day', '2027-10-29', base());
  expect(chooseObservance(both, 'teacher-day', undefined, base()).observanceDates).toEqual({
    'public-servant-day': '2027-10-29',
  });
  expect(
    chooseObservance(teacher, 'teacher-day', undefined, base()).observanceDates,
  ).toBeUndefined();
  expect(base().find((event) => event.id === publicServantDayId)?.start).toBe('2027-10-28');
});

test('projection is idempotent, restores originals and preserves base identity', () => {
  const original = applyObservances(base(), state);
  const selected = chooseObservance(state, 'public-servant-day', '2027-10-29', base());
  const moved = applyObservances(original, selected);
  expect(applyObservances(moved, selected)).toEqual(moved);
  expect(applyObservances(moved, state)).toEqual(original);
  expect(moved.find((event) => event.id === publicServantDayId)?.originalStart).toBe('2027-10-28');
  const snapshot = (events: typeof original) => ({
    revision: 1,
    events,
    documents: [],
    rulesetVersion: policyFor(2027).rulesetVersion(state),
  });
  expect(inspect(snapshot(original), snapshot(moved), state).compatible).toBe(true);
  expect(inspect(snapshot(original), snapshot(original), state).identity).toBe(
    inspect(snapshot(moved), snapshot(moved), state).identity,
  );
});

test('29 October is excluded once and 28 October becomes eligible, including duration calculations', () => {
  const moved = applyObservances(
    base(),
    chooseObservance(state, 'public-servant-day', '2027-10-29', base()),
  );
  expect(
    moved.filter((event) => event.start === '2027-10-29' && event.kind === 'exclude'),
  ).toHaveLength(2);
  expect(durationEnd('2027-10-28', 1, state, base())).toBe('2027-11-03');
  expect(durationEnd('2027-10-28', 1, state, moved)).toBe('2027-10-28');
  expect(durationEnd('2027-10-28', 2, state, moved)).toBe('2027-11-03');
  expect(
    moved
      .filter((event) => event.id !== publicServantDayId)
      .map(({ originalStart: _start, originalEnd: _end, ...event }) => event),
  ).toEqual(base().filter((event) => event.id !== publicServantDayId));
});

test('invalid and orphaned choices stay readable, cannot be confirmed, and can always be cleared', () => {
  const chosen = chooseObservance(state, 'teacher-day', '2027-10-13', base());
  const confirmed = applyObservances(base(), chosen);
  const invalid = { ...state, observanceDates: { 'teacher-day': '2027-10-20' } };
  expect(
    applyObservances(confirmed, invalid).find((event) => event.id === teacherDayId)?.start,
  ).toBe('2027-10-13');
  expect(observanceIssues(confirmed, invalid)).toHaveLength(1);
  expect(() => validateObservances(confirmed, invalid)).toThrow();
  const removed = base().filter((event) => event.id !== teacherDayId);
  expect(() => applyObservances(removed, chosen)).not.toThrow();
  expect(
    calendarObservances(removed, chosen).find((entry) => entry.key === 'teacher-day')?.event,
  ).toBeUndefined();
  expect(
    chooseObservance(chosen, 'teacher-day', undefined, removed).observanceDates,
  ).toBeUndefined();
});

test('unconfigured years and calendars without applicable events cannot choose observances', () => {
  expect(calendarObservances([], { year: 2028 })).toEqual([]);
  expect(() => chooseObservance({ year: 2028 }, 'teacher-day', '2028-10-13', [])).toThrow();
  const postgraduate = inheritedEvents(initialCatalogue(), 2027, [
    { ...offers[0], kind: 'posgraduacao' },
  ]);
  expect(calendarObservances(postgraduate, state)).toEqual([]);
  expect(() => chooseObservance(state, 'teacher-day', '2027-10-13', postgraduate)).toThrow();
});

test('catalogue references cannot leave their policy even by changing year', () => {
  const event = { code: 'ifpr2027-17', year: 2027, start: '2027-10-28', end: '2027-10-28' };
  expect(() => validateObservanceCatalogueEvent(event)).not.toThrow();
  expect(() =>
    validateObservanceCatalogueEvent({ ...event, start: '2027-10-30', end: '2027-10-30' }, event),
  ).toThrow();
  expect(() =>
    validateObservanceCatalogueEvent(
      { ...event, year: 2028, start: '2028-10-28', end: '2028-10-28' },
      event,
    ),
  ).toThrow();
});

test('an old exported choice is rejected explicitly instead of silently disappearing on import', () => {
  expect(() =>
    normalizeOfferCalendar({ ...calendarOffersV4Fixture(), teacherDayDate: '2027-10-13' }),
  ).toThrow('campo antigo');
});
