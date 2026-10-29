import { expect, test } from 'vitest';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { convertCalendarV3 } from '../../src/domain/calendar/normalization/conversion-v4.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { secondSemesterIntake, offerFor } from '../../src/domain/calendar/offers.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';

const rows = (state: ActivityState) => {
  const policy = policyFor(state.year);
  return activityChecklist(state).map((requirement) => ({
    id: requirement.id,
    required: requirement.required,
    applicability: policy.applicability(state, requirement, offerFor(state, 'subsequente')!),
  }));
};

for (const scalar of [undefined, false, true])
  for (const status of [undefined, 'no', 'yes'] as const) {
    test(`2026 preserves registration when scalar=${String(scalar)} and per-offer intake=${String(status)}`, () => {
      const before: ActivityState = {
        schemaVersion: 3,
        year: 2026,
        campus: 'Campus sintético',
        modalities: ['subsequente'],
        regime: 'semestral',
        organizationByModality: { subsequente: 'semestral' },
        assessmentStagesByModality: {},
        weekdays: [],
        weekConfirmed: false,
        periods: [],
        events: [],
        secondSemesterIntake: scalar,
        intakeByModality: status ? { subsequente: { second: { status } } } : {},
      };
      const content = convertCalendarV3(before, {
        year: before.year,
        modalities: before.modalities!,
      });
      const after = { ...content, year: before.year, campus: before.campus };
      expect(rows(after)).toEqual(rows(before));
      expect(content.offers[0].intake).toEqual(before.intakeByModality?.subsequente);
      const differs = (scalar === false) !== (secondSemesterIntake(content.offers) === false);
      expect(content.legacySecondSemesterIntake).toBe(differs ? scalar !== false : undefined);
      const saved = offerCalendarContent(normalizeOfferCalendar(after));
      expect(rows({ ...saved, year: 2026 })).toEqual(rows(before));
    });
  }

test('the compatibility decision does not leak into other policies or annual-only calendars', () => {
  for (const year of [2026, 2027, 2028]) {
    const content = convertCalendarV3(
      {
        schemaVersion: 3,
        regime: 'anual',
        organizationByModality: { subsequente: 'anual' },
        secondSemesterIntake: false,
        weekdays: [],
        weekConfirmed: false,
        periods: [],
        events: [],
      },
      { year, modalities: ['subsequente'] },
    );
    expect(content).not.toHaveProperty('legacySecondSemesterIntake');
  }
  expect(() =>
    normalizeOfferCalendar({
      schemaVersion: 4,
      year: 2027,
      offers: [
        { id: 'subsequente', kind: 'subsequente', delivery: 'a-conferir', organization: 'anual' },
      ],
      legacySecondSemesterIntake: false,
      weekdays: [],
      weekConfirmed: false,
      periods: [],
      events: [],
    }),
  ).toThrow('legada incompatível');
});

test('preserves the operational decision through combined v2 and mixed v3 conversion', () => {
  const first = { id: 'first', name: '1º semestre', start: '2026-02-02', end: '2026-06-30' };
  const second = { id: 'second', name: '2º semestre', start: '2026-08-03', end: '2026-12-18' };
  for (const mixed of [false, true]) {
    const input: ActivityState = {
      ...(mixed
        ? {
            schemaVersion: 3,
            organizationByModality: {
              subsequente: 'semestral' as const,
              graduacao: 'anual' as const,
            },
          }
        : {}),
      year: 2026,
      regime: mixed ? 'misto' : 'semestral',
      modalities: ['subsequente', 'graduacao'],
      secondSemesterIntake: false,
      weekdays: [],
      weekConfirmed: false,
      assessmentStagesByModality: {},
      periods: [first, second],
      events: [],
    };
    const content = convertCalendarV3(input, { year: 2026, modalities: input.modalities! });
    expect(rows({ ...content, year: 2026 })).toEqual(rows(input));
    expect(content.legacySecondSemesterIntake).toBe(false);
    if (!mixed)
      expect(content.offers.every((offer) => offer.intake?.second?.status === 'unknown')).toBe(
        true,
      );
  }
});
