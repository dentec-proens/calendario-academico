import { expect, test } from 'vitest';
import {
  initialMonth,
  isoDate,
  localDate,
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
