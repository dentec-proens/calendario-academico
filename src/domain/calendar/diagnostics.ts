import type { ActivityState } from './model.ts';
import { activityCoverage } from './activities/coverage.ts';
import { calendarModalities } from './modalities.ts';
import { organizationForModality, periodsForModality } from './organization/periods.ts';
import { periodCountByOrganization } from './config.ts';
import type { evaluateCalendar } from './counting/evaluation.ts';

export type CalendarDiagnostic =
  | { code: 'week-unconfirmed' | 'periods-missing' }
  | { code: 'organization-unclassified'; modality: string }
  | { code: 'period-count'; modality: string; expected: number; actual: number };

/** Examines an explicit snapshot. It never claims that local work has been saved or approved. */
export function diagnoseCalendar(state: ActivityState, events = state.events) {
  const structure: CalendarDiagnostic[] = [];
  if (!state.weekConfirmed) structure.push({ code: 'week-unconfirmed' });
  if (!state.periods.length) structure.push({ code: 'periods-missing' });
  for (const modality of calendarModalities(state)) {
    const organization = organizationForModality(state, modality);
    if (organization === 'a-classificar') {
      structure.push({ code: 'organization-unclassified', modality });
      continue;
    }
    const expected = periodCountByOrganization[organization];
    const actual = periodsForModality(state, modality).length;
    if (actual !== expected) structure.push({ code: 'period-count', modality, expected, actual });
  }
  return { structure, coverage: activityCoverage(state, events) };
}

/** Annual offers have one annual minimum; their individual periods do not add another minimum. */
export function diagnoseTeachingDays(
  state: ActivityState,
  result: ReturnType<typeof evaluateCalendar>,
) {
  return Object.entries(result.byModality).flatMap(([modality, detail]) =>
    detail.checks
      .filter(
        (check) => check.scope === 'annual' || organizationForModality(state, modality) !== 'anual',
      )
      .map((check) => ({ ...check, modality })),
  );
}
