import { scopeStatus } from './calendar/offers.ts';
import type { ActivityPlanItem, CalendarOffer } from './calendar/model.ts';
import { compactDate, compactRange } from './date-labels.ts';
import type { CalendarWindow } from './policies/contract.ts';
import { policyFor } from './policies/registry.ts';

/** The academic-year window as the rules page and the period fields both state it. */
export const windowLabel = (window: CalendarWindow, year: number) =>
  `${compactRange(window, year)}, início até ${compactDate(window.latestStart, year)}`;

/**
 * The norm's reference for the periods of one offer, asked of that offer alone: the first offer of
 * a calendar is being drafted before it is in the state. A year without a norm says nothing, and
 * neither does an offer the norm does not reach, because the dates would not apply to it.
 */
export function periodReference(year: number, offer: CalendarOffer) {
  const policy = policyFor(year);
  if (!policy.configured || policy.excludes(offer) || scopeStatus(offer) === 'own-regulation')
    return undefined;
  const window = policy.window({ year, offers: [offer] });
  return window ? `Referência ${year}: ${windowLabel(window, year)} (${window.basis}).` : undefined;
}

/** What the norm asks of an activity, in the words validated for the review; nothing without them. */
export function activityRuleText(
  year: number,
  { reviewCriterionId, reviewInstruction }: Partial<ActivityPlanItem>,
) {
  const { criteria } = policyFor(year).review;
  return (
    criteria.find((criterion) => criterion.id === reviewCriterionId)?.requirement ??
    reviewInstruction
  );
}
