import { operationalChecklist } from '../calendar/activities/operational-checklist.ts';
import { parecerDayMinimums, parecerItems, parecerSource } from '../reviews/parecer-items.ts';
import type { CalendarPolicy } from './contract.ts';

/** Years without a configured norm keep activity links but never assert compliance. */
export const unconfiguredPolicy: CalendarPolicy = {
  configured: false,
  rulesetVersion: (state) => `unconfigured:${state.year ?? ''}`,
  requirements: (state) => operationalChecklist(state),
  applicability: () => 'unconfigured',
  window: () => null,
  countingMinimums: () => ({ annual: null, semester: null }),
  excludes: () => false,
  explicitRecordOffers: false,
  intakeRequirements: false,
  windowInReadiness: false,
  review: {
    // The latest parecer remains the review reference; its dates are not applied to other years.
    source: parecerSource,
    criteria: parecerItems,
    evidence: 'pattern',
    dayMinimums: parecerDayMinimums,
  },
};
