import type { ActivityState } from './model.ts';
import { activityCoverage } from './activities/coverage.ts';
import { calendarOffers, offerFor } from './offers.ts';
import { periodsForOffer } from './organization/periods.ts';
import { periodCountByOrganization } from './config.ts';
import type { evaluateCalendar } from './counting/evaluation.ts';

export type CalendarDiagnostic =
  | { code: 'week-unconfirmed' | 'periods-missing' }
  | { code: 'organization-unclassified'; offerId: string }
  | { code: 'period-count'; offerId: string; expected: number; actual: number };

/** Examines an explicit snapshot. It never claims that local work has been saved or approved. */
export function diagnoseCalendar(state: ActivityState, events = state.events) {
  const structure: CalendarDiagnostic[] = [];
  if (!state.weekConfirmed) structure.push({ code: 'week-unconfirmed' });
  if (!state.periods.length) structure.push({ code: 'periods-missing' });
  for (const offer of calendarOffers(state)) {
    const organization = offer.organization;
    const scope = { offerId: offer.id };
    if (organization === 'a-classificar') {
      structure.push({ code: 'organization-unclassified', ...scope });
      continue;
    }
    const expected = periodCountByOrganization[organization];
    const actual = periodsForOffer(state, offer.id).length;
    if (actual !== expected) structure.push({ code: 'period-count', ...scope, expected, actual });
  }
  return { structure, coverage: activityCoverage(state, events) };
}

/** Annual offers have one annual minimum; their individual periods do not add another minimum. */
export function diagnoseTeachingDays(
  state: ActivityState,
  result: ReturnType<typeof evaluateCalendar>,
) {
  return Object.entries(result.byOffer).flatMap(([offerId, detail]) =>
    detail.checks
      .filter(
        (check) => check.scope === 'annual' || offerFor(state, offerId)?.organization !== 'anual',
      )
      .map((check) => ({
        ...check,
        offerId,
      })),
  );
}
