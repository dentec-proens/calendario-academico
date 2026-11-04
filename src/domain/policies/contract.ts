import { type CivilDate } from '../civil-date.ts';
import type { ActivityPlanItem, AssessmentSettings, CalendarOffer } from '../calendar/model.ts';
import type { ActivityRule } from '../calendar/activities/rules.ts';
import type { ReviewCriterion, ReviewSource } from '../reviews/parecer-items.ts';

export type Applicability = 'required' | 'optional' | 'unconfigured';

/**
 * Effect of a ruleset version on work done under the previous ones. Only `establishes` and
 * `tightens` reopen reviews and base incorporation; a change that both tightens and relaxes
 * is a `tightens`.
 */
export type RulesetEffect = 'establishes' | 'tightens' | 'relaxes' | 'editorial';

export interface RulesetChange {
  version: string;
  /** Date the change was adopted, `YYYY-MM-DD`. */
  date: CivilDate;
  effect: RulesetEffect;
  /** Review criteria whose requirements changed. */
  criteria?: readonly string[];
  /** Norm, Proens communication or decision behind the change. */
  source: string;
  summary: string;
}

export interface CalendarWindow {
  start: CivilDate;
  latestStart: CivilDate;
  end: CivilDate;
  basis: string;
}

export interface Minimum {
  days: number;
  basis: string;
}

/**
 * Everything that varies with the norm governing a calendar year. Consumers ask the policy
 * selected by `policyFor(year)` instead of comparing years, so a new year is one new module
 * registered in `registry.ts`.
 */
export interface ObservanceRule {
  key: string;
  eventCode: string;
  label: string;
  allowedDates: readonly CivilDate[];
  basis: string;
}

export interface CalendarPolicy {
  observances: readonly ObservanceRule[];
  /** Civil year governed by the policy; absent only in the unconfigured fallback. */
  year?: number;
  /** False for the fallback, which keeps links but never asserts compliance. */
  configured: boolean;
  /**
   * Prefix of persisted ruleset versions bound to this policy. When present, the base identity
   * and human reviews are tied to the exact ruleset version, so a rules change needs a new review.
   */
  rulesetPrefix?: string;
  /**
   * Ordered history of the bound ruleset, required with `rulesetPrefix`. The last entry is the
   * current version; versions after the latest `establishes`/`tightens` one are equivalent.
   */
  rulesetChanges?: readonly RulesetChange[];
  rulesetVersion(state: AssessmentSettings): string;
  /**
   * Declared activity rules, required with `rulesetPrefix`. `requirements` expands them, and
   * the portal's rules page (`/regras`) shows them for review against the norm.
   */
  catalogue?: readonly ActivityRule[];
  /** Requirements linked to coverage; `activityPlan` adds the fallback's applicability. */
  requirements(state: AssessmentSettings): ActivityPlanItem[];
  /** The precedence among a requirement's fields belongs to each policy. */
  applicability(
    state: AssessmentSettings,
    requirement: ActivityPlanItem,
    offer: CalendarOffer,
  ): Applicability;
  /** Short explanation shown next to an activity the norm leaves optional for an offer. */
  applicabilityNote?(requirement: ActivityPlanItem, offer: CalendarOffer): string | undefined;
  window(state: AssessmentSettings): CalendarWindow | null;
  /** Minimum teaching days actually enforced by counting; `null` means not configured. */
  countingMinimums(
    state: AssessmentSettings,
    offer: CalendarOffer,
  ): { annual: Minimum | null; semester: Minimum | null };
  /** Offers the norm leaves to their own regulation. */
  excludes(offer: CalendarOffer): boolean;
  /**
   * Which declared activities may make a day a school day (`schoolDayNature`). Absent: dates keep
   * any effect. Activities in neither list are deadlines or milestones.
   */
  schoolDay?: {
    basis: string;
    /** Activities with the effective participation of teachers and students. */
    schoolDayActivities: readonly string[];
    /** Activities that take a day without students: classes kept or suspended. */
    meetings: readonly string[];
  };
  /** Human confirmation of the norm's scope, required before asserting compliance. */
  scope?: {
    /** Short name of the norm shown in the editor. */
    norm: string;
    readinessIssue: string;
  };
  /** Legacy records must declare the offers they cover before counting towards coverage. */
  explicitRecordOffers: boolean;
  review: {
    source: ReviewSource;
    criteria: readonly ReviewCriterion[];
    /** Full citation of the applicable norm, when the policy identifies it. */
    citation?: string;
    /**
     * `coverage`: requirements are linked to criteria and coverage informs the review.
     * `pattern`: only the criteria's name search signals possibly related events.
     */
    evidence: 'coverage' | 'pattern';
    /** Thresholds compared in the review findings. */
    dayMinimums: { annual: number; semester: number };
  };
  notices?: {
    /** Deadline note shown while classifying a regular admission notice. */
    regularAdmission?: string;
  };
}
