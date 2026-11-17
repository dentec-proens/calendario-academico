import type { CalendarPolicy } from '../../policies/contract.ts';
import type { ActivityPlanItem } from '../model.ts';

/**
 * Whether a row is declared only so stored links keep reading: merged into another activity or
 * retired. Lists and review evidence show it only while some date still links to it.
 */
export const keptForOldLinks = (item: Pick<ActivityPlanItem, 'mergedInto' | 'retired'>) =>
  Boolean(item.mergedInto || item.retired);

/** Activities the policy retired; their dates leave every calendar that is edited again. */
export const retiredActivities = (policy: Pick<CalendarPolicy, 'catalogue'>): Set<string> =>
  new Set((policy.catalogue ?? []).filter((rule) => rule.retired).map((rule) => rule.id));

/**
 * The dates without those linked to a retired activity. Returns `undefined` when none is linked, so
 * a migration writes only what changes and running it again changes nothing.
 */
export function dropRetiredActivityDates<E extends { activity?: { activityId: string } }>(
  events: readonly E[],
  retired: ReadonlySet<string>,
): E[] | undefined {
  const kept = events.filter((event) => !retired.has(event.activity?.activityId ?? ''));
  return kept.length === events.length ? undefined : kept;
}

/** The state without dates of activities its policy retired; else unchanged. */
export function withRetiredActivitiesDropped<
  S extends { events: readonly { activity?: { activityId: string } }[] },
>(state: S, policy: Pick<CalendarPolicy, 'catalogue'>): S {
  const events = dropRetiredActivityDates(state.events, retiredActivities(policy));
  return events ? { ...state, events } : state;
}
