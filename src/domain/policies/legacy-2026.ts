import { operationalChecklist } from '../calendar/activities/operational-checklist.ts';
import { parecerDayMinimums, parecerItems, parecerSource } from '../reviews/parecer-items.ts';
import type { CalendarPolicy } from './contract.ts';

const excludedModalities = ['posgraduacao'] as const;

/** 2026 roteiro: operational checklist reviewed against the parecer, without counting thresholds. */
export const legacy2026Policy: CalendarPolicy = {
  year: 2026,
  configured: true,
  usesLegacySecondSemesterIntake: true,
  rulesetVersion: () => 'legacy-2026-v1',
  requirements: (state) =>
    operationalChecklist(state, {
      usesLegacySecondSemesterIntake: true,
      deadlines: { robotics: '2026-08-31', 'course-showcase': '2026-09-30' },
      criteria: { 'cultural-week': 'XXV' },
    }),
  applicability: (_state, requirement) =>
    requirement.required === false ? 'optional' : 'required',
  window: () => ({
    start: '2026-02-04',
    latestStart: '2026-02-28',
    end: '2026-12-18',
    basis: 'Referência do parecer de 2026',
  }),
  // Historical review references do not automatically become active counting thresholds.
  countingMinimums: () => ({ annual: null, semester: null }),
  excludedModalities,
  explicitRecordOffers: false,
  intakeRequirements: false,
  windowInReadiness: false,
  review: {
    source: parecerSource,
    criteria: parecerItems,
    evidence: 'pattern',
    dayMinimums: parecerDayMinimums,
    annualReference: (modality) =>
      excludedModalities.some((excluded) => excluded === modality)
        ? undefined
        : parecerDayMinimums.annual,
  },
};
