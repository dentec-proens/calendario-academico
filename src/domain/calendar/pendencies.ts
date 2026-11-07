import { activityKey, isAssessmentStage, type ActivityRef } from './activities/activity-ref.ts';
import { generatedActivities, generatedActivity, linksToReview } from './activities/links.ts';
import { isVacationActivity } from './activities/vacations.ts';
import type { ActivityState, InstitutionalEventSnapshot } from './model.ts';
import {
  contentIssues,
  type ContentIssue,
  type ContentIssueGroup,
  type ContentIssueTarget,
} from './readiness.ts';

/** One sentence of a pendency and the offers it was diagnosed for (none: the whole calendar). */
export interface PendencyDetail {
  text: string;
  offerIds: string[];
}

/**
 * What the editor counts and lists as one pending item: an activity, however many offers it is
 * missing from, a date, an adjustable date or a structure or teaching-day item. It only presents
 * the diagnostics: readiness, comparisons, publication and the review opinion keep reading each
 * `ContentIssue`, by offer, with its `code` and `message`.
 */
export interface Pendency {
  /** Address of the item, stable while it stays pending; an item alone keeps its issue's code. */
  key: string;
  group: ContentIssueGroup;
  title: string;
  details: PendencyDetail[];
  /** Offers named by the diagnostics, in calendar order of appearance. */
  offerIds: string[];
  target?: ContentIssueTarget;
  /** The diagnostics this item presents, unchanged. */
  issues: ContentIssue[];
}

export const pendencyGroupOrder: readonly ContentIssueGroup[] = [
  'structure',
  'activities',
  'dates',
  'teaching-days',
];

type PendencyState = Parameters<typeof linksToReview>[0];

/** Where one diagnostic belongs, from what it says must be corrected. */
function placement(issue: ContentIssue, state: PendencyState) {
  const { target } = issue;
  const activity = (ref: ActivityRef, title = issue.title) => ({
    key: `activity:${activityKey(ref)}`,
    // Assessment intervals are corrected in the organization of the offer, not in Activities.
    group: isAssessmentStage(ref) ? ('structure' as const) : ('activities' as const),
    title,
    target: { area: 'activity', activity: ref } as const,
  });
  if (target?.area === 'activity') return { ...activity(target.activity), offerIds: [] };
  if (target?.area === 'date') {
    const event = state.events.find((item) => item.id === target.eventId);
    // A date that fulfils an activity is listed under it: its problem is that activity's, so the
    // activity keeps counting once and the correction starts from the same place.
    const generated =
      event && !linksToReview(state).has(event.id)
        ? generatedActivity(generatedActivities(state), event.activity)
        : undefined;
    if (generated && event)
      return { ...activity(generated.activity, generated.name), offerIds: event.offers };
    return {
      key: `date:${target.eventId}`,
      group: issue.group,
      title: issue.title,
      target,
      offerIds: [],
    };
  }
  if (target?.area === 'observance')
    return {
      key: `observance:${target.key}`,
      group: issue.group,
      title: issue.title,
      target,
      offerIds: [],
    };
  // The same pending norm, whichever offers are still to confirm it.
  if (target?.area === 'scope')
    return { key: 'scope', group: issue.group, title: issue.title, target, offerIds: [] };
  return { key: issue.code, group: issue.group, title: issue.title, target, offerIds: [] };
}

/** Groups diagnostics into the items the editor shows, in the order the review step lists them. */
export function groupPendencies(issues: readonly ContentIssue[], state: PendencyState): Pendency[] {
  const items = new Map<string, Pendency>();
  for (const issue of issues) {
    const { offerIds, ...place } = placement(issue, state);
    const item: Pendency = items.get(place.key) ?? {
      ...place,
      details: [],
      offerIds: [],
      issues: [],
    };
    const offers = issue.offerId ? [issue.offerId] : offerIds;
    item.issues.push(issue);
    item.offerIds = [...new Set([...item.offerIds, ...offers])];
    const detail = item.details.find((candidate) => candidate.text === issue.detail);
    if (detail) detail.offerIds = [...new Set([...detail.offerIds, ...offers])];
    else item.details.push({ text: issue.detail, offerIds: [...offers] });
    items.set(place.key, item);
  }
  return pendencyGroupOrder.flatMap((group) =>
    [...items.values()].filter((item) => item.group === group),
  );
}

/** Activities still to fill in the Activities step, each counted once. */
export function pendingActivityCount(
  state: ActivityState,
  institutionalSnapshot: InstitutionalEventSnapshot[],
) {
  return groupPendencies(contentIssues(state, institutionalSnapshot), state).filter(
    (item) =>
      item.target?.area === 'activity' &&
      !isAssessmentStage(item.target.activity) &&
      !isVacationActivity(item.target.activity),
  ).length;
}
