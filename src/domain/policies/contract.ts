import type { ActivityRequirement, AssessmentSettings } from '../calendar/model.ts';
import type { ReviewCriterion, ReviewSource } from '../reviews/parecer-items.ts';

export type Applicability = 'required' | 'optional' | 'unconfigured';

export interface CalendarWindow {
  start: string;
  latestStart: string;
  end: string;
  basis: string;
}

/**
 * Everything that varies with the norm governing a calendar year. Consumers ask the policy
 * selected by `policyFor(year)` instead of comparing years, so a new year is one new module
 * registered in `registry.ts`.
 */
export interface CalendarPolicy {
  /** Civil year governed by the policy; absent only in the unconfigured fallback. */
  year?: number;
  /** False for the fallback, which keeps links but never asserts compliance. */
  configured: boolean;
  /**
   * Prefix of persisted ruleset versions bound to this policy. When present, the base identity
   * and human reviews are tied to the exact ruleset version, so a rules change needs a new review.
   */
  rulesetPrefix?: string;
  rulesetVersion(state: AssessmentSettings): string;
  /** Requirements linked to coverage; `activityChecklist` adds the fallback's applicability. */
  requirements(state: AssessmentSettings): ActivityRequirement[];
  applicability(
    state: AssessmentSettings,
    requirement: ActivityRequirement,
    modality: string,
  ): Applicability;
  /** Short explanation shown next to an activity the norm leaves optional for an offer. */
  applicabilityNote?(requirementId: string, modality: string): string | undefined;
  window(state: AssessmentSettings): CalendarWindow | null;
  /** Minimum teaching days actually enforced by counting; `null` means not configured. */
  countingMinimums(
    state: AssessmentSettings,
    modality: string,
  ): { annual: number | null; semester: number | null };
  /** Offers the norm leaves to their own regulation. */
  excludedModalities: readonly string[];
  /** Human confirmation of the norm's scope, required before asserting compliance. */
  scope?: {
    /** Short name of the norm shown in the editor. */
    norm: string;
    readinessIssue: string;
  };
  /** Legacy records must declare the offers they cover before counting towards coverage. */
  explicitRecordOffers: boolean;
  /** Local requirement of new-student registration per offer and cycle. */
  intakeRequirements: boolean;
  /** Readiness warns when an offer's periods leave the norm's window. */
  windowInReadiness: boolean;
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
    /** Reference shown for the annual total when counting itself has no configured minimum. */
    annualReference?(modality: string): number | undefined;
  };
  notices?: {
    /** Deadline note shown while classifying a regular admission notice. */
    regularAdmission?: string;
  };
}
