import type { AssessmentSettings, ActivityRequirement, CalendarOffer } from '../calendar/model.ts';
import { offerFor } from '../calendar/offers.ts';
import { DomainError } from '../errors.ts';
import { consup2922027Policy } from './consup-292-2027/index.ts';
import type { CalendarPolicy, RulesetChange } from './contract.ts';
import { unconfiguredPolicy } from './unconfigured.ts';

const policies: readonly CalendarPolicy[] = [consup2922027Policy];

/** The single place that maps a calendar year to its norm. */
export function policyFor(year: number | string | undefined): CalendarPolicy {
  return policies.find((policy) => policy.year === Number(year)) ?? unconfiguredPolicy;
}

/** Years whose declared catalogue the portal's rules page shows. */
export const documentedYears = policies.flatMap((policy) =>
  policy.catalogue && policy.year ? [policy.year] : [],
);

/** Most recent configured year, offered by default when creating a calendar. */
export const defaultCalendarYear = Math.max(...policies.map((policy) => policy.year ?? 0));

/** Whether a persisted ruleset version binds base identity and reviews to its exact version. */
export function bindsRuleset(version: string | undefined): boolean {
  return policies.some(
    (policy) => policy.rulesetPrefix !== undefined && version?.startsWith(policy.rulesetPrefix),
  );
}

const historyOf = (version: string | undefined): readonly RulesetChange[] =>
  policies.find(
    (policy) => policy.rulesetPrefix !== undefined && version?.startsWith(policy.rulesetPrefix),
  )?.rulesetChanges ?? [];

/**
 * The version a review or base made under `version` is bound to: the latest one up to it that
 * establishes or tightens requirements. Versions missing from the history are their own boundary.
 */
export function reviewBoundary(
  version: string | undefined,
  changes: readonly RulesetChange[] = historyOf(version),
): string | undefined {
  const index = changes.findIndex((change) => change.version === version);
  if (index < 0) return version;
  return (
    changes
      .slice(0, index + 1)
      .findLast((change) => change.effect === 'establishes' || change.effect === 'tightens')
      ?.version ?? version
  );
}

/** Whether work done under `before` still holds under `after`, since only relaxations or wording changed. */
export const equivalentRulesets = (before: string | undefined, after: string | undefined) =>
  before === after || (before !== undefined && reviewBoundary(before) === reviewBoundary(after));

/** Versions adopted after `before` up to `after`, shown when new rules are adopted. */
export function rulesetChangesBetween(
  before: string | undefined,
  after: string | undefined,
): readonly RulesetChange[] {
  const changes = historyOf(after);
  const end = changes.findIndex((change) => change.version === after);
  return changes.slice(changes.findIndex((change) => change.version === before) + 1, end + 1);
}

export const rulesetVersion = (state: AssessmentSettings) =>
  policyFor(state.year).rulesetVersion(state);

export const applicabilityFor = (
  state: AssessmentSettings,
  requirement: ActivityRequirement,
  offer: CalendarOffer | string,
) => policyFor(state.year).applicability(state, requirement, resolveOffer(state, offer));

function resolveOffer(state: AssessmentSettings, offer: CalendarOffer | string): CalendarOffer {
  if (typeof offer !== 'string') return offer;
  const resolved = offerFor(state, offer);
  if (!resolved) throw new DomainError('A oferta não pertence ao calendário.');
  return resolved;
}

export const countingMinimums = (state: AssessmentSettings, offer: CalendarOffer | string) =>
  policyFor(state.year).countingMinimums(state, resolveOffer(state, offer));
