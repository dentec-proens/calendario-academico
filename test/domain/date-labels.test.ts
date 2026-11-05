import { describe, expect, it } from 'vitest';
import { compactDate, compactRange, longDate, longRange } from '#src/domain/date-labels.ts';

const range = (start: string, end: string) => ({ start, end });

describe('compact labels for lists', () => {
  it('omits what repeats and the year of the calendar in context', () => {
    expect(compactRange(range('2027-01-04', '2027-01-04'), 2027)).toBe('4 jan');
    expect(compactRange(range('2027-02-01', '2027-02-05'), 2027)).toBe('1 a 5 fev');
    expect(compactRange(range('2027-02-11', '2027-03-19'), 2027)).toBe('11 fev a 19 mar');
  });

  it('shows the year when it differs from the calendar in context', () => {
    expect(compactRange(range('2028-01-04', '2028-01-04'), 2027)).toBe('4 jan 2028');
    expect(compactRange(range('2028-01-04', '2028-02-08'), 2027)).toBe('4 jan a 8 fev 2028');
  });

  it('shows both years when a range crosses the year', () => {
    expect(compactRange(range('2027-12-22', '2028-01-03'), 2027)).toBe('22 dez 2027 a 3 jan 2028');
  });

  it('always shows the year without a calendar in context', () => {
    expect(compactDate('2027-05-09')).toBe('9 mai 2027');
    expect(compactRange(range('2027-02-01', '2027-02-05'))).toBe('1 a 5 fev 2027');
  });

  it('abbreviates every month', () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      compactDate(`2027-${String(index + 1).padStart(2, '0')}-01`, 2027).slice(2),
    );
    expect(months).toEqual('jan fev mar abr mai jun jul ago set out nov dez'.split(' '));
  });
});

describe('long labels for details and sentences', () => {
  it('writes the month in full and always the year', () => {
    expect(longDate('2027-03-31')).toBe('31 de março de 2027');
    expect(longRange(range('2027-01-04', '2027-01-04'))).toBe('4 de janeiro de 2027');
    expect(longRange(range('2027-02-01', '2027-02-05'))).toBe('1 a 5 de fevereiro de 2027');
    expect(longRange(range('2027-02-11', '2027-03-19'))).toBe(
      '11 de fevereiro a 19 de março de 2027',
    );
    expect(longRange(range('2027-12-22', '2028-01-03'))).toBe(
      '22 de dezembro de 2027 a 3 de janeiro de 2028',
    );
  });
});
