import { expect, expectTypeOf, test } from 'vitest';
import { civilDate, parseDate, type CivilDate } from '../../src/domain/civil-date.ts';
import { datesBetween, daysBefore } from '../../src/domain/calendar/counting/core.ts';
import { readActivityDates, readCalendarDates } from '../../src/domain/calendar/civil-dates.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import type {
  CalendarEvent,
  CalendarContent,
  VacationPeriods,
} from '../../src/domain/calendar/model.ts';
import type { ObservanceRule, CalendarWindow } from '../../src/domain/policies/contract.ts';

test('CivilDate is a validated primitive string, distinct from arbitrary input at compile time', () => {
  expectTypeOf<string>().not.toExtend<CivilDate>();
  expectTypeOf<CivilDate>().toExtend<string>();
  expectTypeOf<ObservanceRule['allowedDates'][number]>().toEqualTypeOf<CivilDate>();
  expectTypeOf<CalendarEvent['start']>().toEqualTypeOf<CivilDate>();
  expectTypeOf<CalendarContent['observanceDates']>().toEqualTypeOf<
    Record<string, CivilDate> | undefined
  >();
  expectTypeOf<VacationPeriods['firstStart']>().toEqualTypeOf<CivilDate>();
  expectTypeOf<CalendarWindow['latestStart']>().toEqualTypeOf<CivilDate>();
  const value = civilDate('2027-10-28');
  expect(typeof value).toBe('string');
  expect(JSON.stringify({ value })).toBe('{"value":"2027-10-28"}');
});

test.each(['2024-02-29', '2000-02-29', '0099-01-01', '2027-10-28', '9999-12-31'])(
  'accepts the real canonical civil date %s without changing its value',
  (value) => {
    expect(civilDate(value)).toBe(value);
    expect(new Date(parseDate(value)).toISOString().slice(0, 10)).toBe(value);
  },
);

test.each([
  '2027-02-29',
  '1900-02-29',
  '2027-02-30',
  '2027-04-31',
  '2027-00-01',
  '2027-13-01',
  '2027-01-00',
  '2027-01-32',
  '2027-1-01',
  '27-01-01',
  '10000-01-01',
  '2027-10-28T00:00:00Z',
  '2027-10-28T00:00:00-03:00',
  ' 2027-10-28',
  '2027-10-28 ',
  '',
  undefined,
  null,
  20271028,
  new Date('2027-10-28T00:00:00Z'),
  {},
  [],
])('rejects malformed or nonexistent dates at construction: %s', (value) => {
  expect(() => civilDate(value)).toThrow();
});

test('date arithmetic returns CivilDate across leap days and year boundaries', () => {
  const days = datesBetween('2024-02-28', '2024-03-01');
  expectTypeOf(days).toEqualTypeOf<CivilDate[]>();
  expect(days).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  expect(daysBefore(civilDate('2027-01-01'), 1)).toBe('2026-12-31');
  expect(() => datesBetween('2027-02-30', '2027-03-01')).toThrow();
});

test('reading persisted dates preserves historical choices, metadata and the exact JSON representation', () => {
  const input = {
    ...calendarOffersV4Fixture(),
    observanceDates: { 'retired-policy': '2027-11-01' },
    teacherVacations: { firstStart: '2027-01-02', firstEnd: '2027-01-31' },
    events: [
      {
        id: 'historic',
        effect: 'note',
        name: 'Referência histórica',
        start: '2027-10-29',
        end: '2027-10-29',
        originalStart: '2027-10-28',
        originalEnd: '2027-10-28',
        assessmentAutoStart: '2027-10-01',
        deadlineAdjustment: { date: '2027-10-30', reviewed: true, evidence: 'Decisão preservada' },
      },
    ],
    updatedAt: '2026-10-30T15:00:00Z',
  };
  const decoded = readCalendarDates(input);
  expectTypeOf(decoded.events[0].deadlineAdjustment.date).toEqualTypeOf<CivilDate>();
  expectTypeOf(decoded.updatedAt).toEqualTypeOf<string>();
  expect(decoded).toEqual(input);
  expect(JSON.stringify(decoded)).toBe(JSON.stringify(input));
  expect(readCalendarDates(JSON.parse(JSON.stringify(decoded)) as typeof input)).toEqual(decoded);
});

test.each(['start', 'end', 'originalStart', 'originalEnd', 'assessmentAutoStart'] as const)(
  'the activity read boundary validates %s',
  (key) => {
    expect(() =>
      readActivityDates({ start: '2027-10-28', end: '2027-10-28', [key]: '2027-02-30' }),
    ).toThrow();
  },
);

test('JSON import validates auxiliary dates, observances and vacations as well as event intervals', () => {
  const base = calendarOffersV4Fixture();
  for (const invalid of [
    { ...base, observanceDates: { 'teacher-day': '2027-02-30' } },
    { ...base, teacherVacations: { firstStart: '2027-02-30', firstEnd: '2027-03-01' } },
    { ...base, events: [{ ...base.events[0], assessmentAutoStart: '2027-02-30' }] },
    {
      ...base,
      events: [{ ...base.events[0], deadlineAdjustment: { date: '2027-02-30', reviewed: false } }],
    },
  ])
    expect(() => normalizeOfferCalendar(invalid)).toThrow();
});

test('empty optional vacation fields from saved forms mean absence, including on JSON import', () => {
  const input = {
    ...calendarOffersV4Fixture(),
    teacherVacations: {
      firstStart: '2027-01-02',
      firstEnd: '2027-01-31',
      secondStart: '',
      secondEnd: '',
      thirdStart: '',
      thirdEnd: '',
    },
  };
  for (const read of [readCalendarDates, normalizeOfferCalendar]) {
    const decoded = read(input);
    expect(decoded.teacherVacations).toEqual({ firstStart: '2027-01-02', firstEnd: '2027-01-31' });
  }
  expect(() =>
    readCalendarDates({
      ...input,
      teacherVacations: { ...input.teacherVacations, firstStart: '' },
    }),
  ).toThrow();
  expect(() =>
    readCalendarDates({
      ...input,
      teacherVacations: { ...input.teacherVacations, thirdStart: '2027-02-30' },
    }),
  ).toThrow();
});
