import { expect, test } from 'vitest';
import {
  initialMonth,
  isoDate,
  localDate,
  monthAfterChange,
  nextDateRange,
} from '../../web/features/calendar-editor/events/date-calendar.ts';
import { waitingLabel } from '../../web/shared/dates.ts';

test('a first click marks one day, a later day closes the range and others start again', () => {
  const single = nextDateRange({ start: '', end: '' }, '2027-03-10');
  expect(single).toEqual({ start: '2027-03-10', end: '2027-03-10' });
  const range = nextDateRange(single, '2027-03-12');
  expect(range).toEqual({ start: '2027-03-10', end: '2027-03-12' });
  expect(nextDateRange(range, '2027-03-11')).toEqual({ start: '2027-03-11', end: '2027-03-11' });
  expect(nextDateRange(single, '2027-03-01')).toEqual({ start: '2027-03-01', end: '2027-03-01' });
});

test('the month follows the date that changed, ignoring a year still being typed', () => {
  const shown = localDate('2027-01-10')!;
  const empty = { start: '', end: '' };
  const change = (previous: typeof empty, next: typeof empty, on = shown) =>
    monthAfterChange(previous, next, on, [{ start: '2027-02-01' }], 2027);
  const set = { start: '2027-02-15', end: '2027-02-15' };
  expect(isoDate(change(empty, set)!)).toBe('2027-02-15');
  expect(isoDate(change(set, { ...set, end: '2027-04-02' })!)).toBe('2027-04-02');
  // A click in the month on screen, a cleared field and a partial year move nothing.
  expect(change(empty, { start: '2027-01-20', end: '2027-01-20' })).toBeUndefined();
  expect(change(set, { ...set, start: '' })).toBeUndefined();
  expect(change(set, { ...set, start: '0002-02-15' })).toBeUndefined();
  expect(change(set, { ...set, start: '0202-02-15' })).toBeUndefined();
  // A complete year counts, however far: an earlier fact keeps its real date.
  expect(isoDate(change(set, { ...set, start: '2025-04-15' })!)).toBe('2025-04-15');
  // Another form with no dates returns to where the calendar opens.
  expect(isoDate(change(set, empty)!)).toBe('2027-02-01');
});

test('dates cross the local-time day picker without changing the civil day', () => {
  expect(isoDate(localDate('2027-01-01')!)).toBe('2027-01-01');
  expect(localDate('')).toBeUndefined();
});

test('the calendar opens on the date, else on the first period, else on the year', () => {
  const periods = [{ start: '2027-03-01' }, { start: '2027-02-08' }];
  expect(isoDate(initialMonth('2027-06-15', periods, 2027))).toBe('2027-06-15');
  expect(isoDate(initialMonth('', periods, 2027))).toBe('2027-02-08');
  expect(isoDate(initialMonth('', [], 2027))).toBe('2027-01-01');
});

test('the wait is told in the unit a reviewer would use', () => {
  const sent = '2027-03-10T12:00:00.000Z';
  const after = (hours: number) => Date.parse(sent) + hours * 3_600_000;
  expect(waitingLabel(sent, after(0))).toBe('Aguardando há menos de 1 hora');
  expect(waitingLabel(sent, after(1))).toBe('Aguardando há 1 hora');
  expect(waitingLabel(sent, after(23))).toBe('Aguardando há 23 horas');
  expect(waitingLabel(sent, after(24))).toBe('Aguardando há 1 dia');
  expect(waitingLabel(sent, after(72))).toBe('Aguardando há 3 dias');
  expect(waitingLabel(null, after(1))).toBeNull();
  expect(waitingLabel('inválida', after(1))).toBeNull();
});
