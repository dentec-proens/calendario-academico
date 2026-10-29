import type { AssessmentSettings, ActivityRequirement } from '../calendar/model.ts';
import { consup2922027Policy } from './consup-292-2027.ts';
import type { CalendarPolicy } from './contract.ts';
import { legacy2026Policy } from './legacy-2026.ts';
import { unconfiguredPolicy } from './unconfigured.ts';

const policies: readonly CalendarPolicy[] = [legacy2026Policy, consup2922027Policy];

/** The single place that maps a calendar year to its norm. */
export function policyFor(year: number | string | undefined): CalendarPolicy {
  return policies.find((policy) => policy.year === Number(year)) ?? unconfiguredPolicy;
}

/** Most recent configured year, offered by default when creating a calendar. */
export const defaultCalendarYear = Math.max(...policies.map((policy) => policy.year ?? 0));

/** Whether a persisted ruleset version binds base identity and reviews to its exact version. */
export function bindsRuleset(version: string | undefined): boolean {
  return policies.some(
    (policy) => policy.rulesetPrefix !== undefined && version?.startsWith(policy.rulesetPrefix),
  );
}

export const rulesetVersion = (state: AssessmentSettings) =>
  policyFor(state.year).rulesetVersion(state);

export const applicabilityFor = (
  state: AssessmentSettings,
  requirement: ActivityRequirement,
  modality: string,
) => policyFor(state.year).applicability(state, requirement, modality);

export const countingMinimums = (state: AssessmentSettings, modality: string) =>
  policyFor(state.year).countingMinimums(state, modality);
