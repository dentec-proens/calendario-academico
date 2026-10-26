import { expect, test } from 'vitest';
import { calendarReferenceAnchor, isCalendarReferenceHash } from '../src/calendar-reference.ts';

test('only the known optional reference fragment requests the history disclosure', () => {
  expect(isCalendarReferenceHash(calendarReferenceAnchor)).toBe(true);
  expect(isCalendarReferenceHash('#' + calendarReferenceAnchor)).toBe(true);
  for (const hash of ['', '#token=secret', '#history-area', '#calendario-anterior-extra'])
    expect(isCalendarReferenceHash(hash)).toBe(false);
});
