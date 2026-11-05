import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { teachingDayEffects } from '../../web/features/calendar-editor/base-changes.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import type { CalendarState } from '../../web/features/calendar-editor/types.ts';

const fixture = calendarOffersFixture();
const state = { ...fixture, weekConfirmed: true, weekdays: [1, 2, 3, 4, 5] } as CalendarState;
const inPeriod = fixture.periods.find((period) =>
  period.association.offers.includes('graduacao-2'),
)!.start;
function nextWeekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
const holiday = (offers: string[]) => ({
  id: 'inst:holiday',
  name: 'Feriado',
  start: civilDate(nextWeekday(inPeriod)),
  end: civilDate(nextWeekday(inPeriod)),
  effect: 'exclude' as const,
  category: 'feriado',
  evidence: 'Portaria',
  offers,
  institutional: true as const,
});

test('a new event that reaches only one offer is told for that offer', () => {
  const effects = teachingDayEffects(state, [], [holiday(['graduacao-2'])]);
  expect(effects).toHaveLength(1);
  expect(effects[0]).toMatch(/^Dias letivos de .*: de \d+ para \d+\.$/);
});

test('a change that moves no count says nothing', () => {
  expect(teachingDayEffects(state, [holiday(['integrado'])], [holiday(['integrado'])])).toEqual([]);
});

test('a calendar without a confirmed week says nothing', () => {
  expect(
    teachingDayEffects({ ...state, weekConfirmed: false }, [], [holiday(['integrado'])]),
  ).toEqual([]);
});
