import { expect, test } from 'vitest';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';

const calendar = (
  decision: boolean | undefined,
  status?: 'no' | 'yes' | 'unknown',
): ActivityState => ({
  schemaVersion: 4,
  year: 2026,
  campus: 'Campus sintético',
  weekdays: [],
  weekConfirmed: false,
  periods: [],
  events: [],
  legacySecondSemesterIntake: decision,
  offers: [
    {
      id: 'subsequente',
      kind: 'subsequente',
      delivery: 'a-conferir',
      organization: 'semestral',
      ...(status ? { intake: { second: { status } } } : {}),
    },
  ],
});

for (const decision of [undefined, false, true])
  for (const status of [undefined, 'no', 'yes', 'unknown'] as const)
    test(`2026 preserves its operational decision (${String(decision)}) independently of actual intake (${String(status)})`, () => {
      const state = calendar(decision, status);
      const suppressed =
        (decision ?? (status === 'no' ? false : status === 'yes' ? true : undefined)) === false;
      const rows = activityChecklist(state);
      expect(rows.find((row) => row.id === 'registration-2')?.required === false).toBe(suppressed);
      expect(rows.some((row) => row.id === 'enrolment-2')).toBe(true);
      expect(rows.some((row) => row.id === 'registration-1')).toBe(true);
      const saved = offerCalendarContent(normalizeOfferCalendar(state));
      expect(saved.offers[0].intake).toEqual(state.offers[0].intake);
      expect(saved.legacySecondSemesterIntake).toBe(decision);
      expect(activityChecklist({ ...saved, year: 2026 }).map((row) => row.id)).toEqual(
        rows.map((row) => row.id),
      );
    });

test('the compatibility decision is refused by policies that do not use it', () => {
  for (const year of [2027, 2028])
    expect(() => normalizeOfferCalendar({ ...calendar(false, 'yes'), year })).toThrow(
      'legada incompatível',
    );
});

test('2026 mixed organizations preserve the operational decision without inventing intake', () => {
  const state = calendar(false, 'unknown');
  state.offers.push({
    id: 'graduacao',
    kind: 'graduacao',
    delivery: 'a-conferir',
    organization: 'anual',
  });
  const before = structuredClone(state.offers);
  expect(activityChecklist(state).find((row) => row.id === 'registration-2')?.required).toBe(false);
  expect(offerCalendarContent(normalizeOfferCalendar(state)).offers).toEqual(before);
});
