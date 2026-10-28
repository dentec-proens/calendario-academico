import { calendarWindow2026 } from './legacy-2026.ts';
import {
  rules2027,
  normativeDayMinimums,
  calendarWindow2027,
  applicability2027For,
} from './consup-292-2027.ts';
import type { AssessmentSettings, ActivityRequirement } from '../model.ts';
import { calendarModalities } from '../modalities.ts';
export function rulesetVersion(state: AssessmentSettings): string {
  if (state.year === 2026) return 'legacy-2026-v1';
  return state.year === normativeDayMinimums.year &&
    calendarModalities(state).some(
      (m) => !normativeDayMinimums.excludedModalities.some((excluded) => excluded === m),
    )
    ? rules2027
    : `unconfigured:${state.year ?? ''}`;
}
export function calendarWindow(state: AssessmentSettings) {
  if (
    state.year === 2027 &&
    state.scopeConfirmation?.status !== 'own-regulation' &&
    calendarModalities(state).some((m) => m !== 'posgraduacao')
  )
    return { ...calendarWindow2027 };
  if (state.year === 2026) return { ...calendarWindow2026 };
  return null;
}

export function applicabilityFor(
  state: AssessmentSettings,
  requirement: ActivityRequirement,
  modality: string,
): 'required' | 'optional' | 'unconfigured' {
  if (state.year === 2026) return requirement.required === false ? 'optional' : 'required';
  if (state.year === 2027) return applicability2027For(state, requirement, modality);
  return 'unconfigured';
}

/** Historical review references do not automatically become active counting thresholds. */
export function countingMinimums(state: AssessmentSettings, modality: string) {
  const configured =
    state.year === normativeDayMinimums.year &&
    !normativeDayMinimums.excludedModalities.some((excluded) => excluded === modality) &&
    state.scopeConfirmation?.status === 'covered';
  return {
    annual: configured ? normativeDayMinimums.annual : null,
    semester: configured ? normativeDayMinimums.semester : null,
  };
}
