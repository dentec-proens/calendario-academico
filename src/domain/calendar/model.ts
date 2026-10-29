import type { ActivityGroup, ActivityVariant } from './activities/metadata.ts';

/** Shared contracts for calendar activities and the operational checklist. */
import type { AcademicTerm, Organization } from './config.ts';
export type { AcademicTerm, Organization } from './config.ts';
export type OfferKind = 'integrado' | 'subsequente' | 'graduacao' | 'posgraduacao';
export type OfferDelivery = 'presencial' | 'ead' | 'a-conferir';
/** Identity is immutable within the calendar; kind determines normative applicability. */
export interface CalendarOffer {
  id: string;
  kind: OfferKind;
  label?: string;
  delivery: OfferDelivery;
  organization: Organization;
  stages?: { perTerm: number };
  /** Previous annual ordinals, retained only while organization has no classified cycle. */
  legacyStageCount?: 2 | 3 | 4;
  scope?: { status: 'covered' | 'own-regulation' };
  intake?: Partial<Record<AcademicTerm, IntakeConfiguration>>;
  organizationBasis?: string;
}
export type PeriodAssociationV4 =
  { status: 'defined'; offers: string[]; term: AcademicTerm } | { status: 'a-classificar' };
export type CalendarPeriodV4 = CalendarPeriod;
export type CalendarActivityV4 = CalendarActivity;
/** Version four persists offer configuration, never its derived summaries. */
export interface CalendarContentV4 {
  schemaVersion: 4;
  rulesetVersion?: string;
  offers: CalendarOffer[];
  weekdays: number[];
  weekConfirmed: boolean;
  periods: CalendarPeriodV4[];
  events: CalendarActivityV4[];
  teacherDayDate?: string;
  teacherVacations?: VacationPeriods;
  /** Preserves the independent operational decision used only by the 2026 policy. */
  legacySecondSemesterIntake?: boolean;
}
export type PeriodAssociation = PeriodAssociationV4;
export interface Admission {
  type: 'regular' | 'transfer';
  year: number;
  term: AcademicTerm;
  periodId?: string;
}
export interface IntakeConfiguration {
  status: 'unknown' | 'yes' | 'no';
  required?: boolean;
}
export interface CalendarActivity {
  id: string;
  name: string;
  start: string;
  end: string;
  kind: string;
  category?: string;
  requirementId?: string;
  offers?: string[];
  hours?: number;
  days?: number;
  originalStart?: string;
  originalEnd?: string;
  assessmentAutoStart?: string;
  deadlineExtensionCause?: 'municipal-holiday' | 'municipal-recess';
  recordType?: 'event' | 'prior-reference' | 'retired-stage';
  publicationStatus?: 'planned' | 'published';
  admission?: Admission;
  deadlineAdjustment?: { date: string; reviewed: boolean };
}

export interface ActivityRequirement {
  id: string;
  name: string;
  required?: boolean;
  deadline?: string;
  deadlinePolicy?: 'reference' | 'fixed';
  minHours?: number;
  month?: number;
  offerId?: string;
  offerIds?: string[];
  modalities?: string[];
  term?: AcademicTerm;
  periodId?: string;
  basis?: string;
  /** Decision that narrows or widens `basis`, with the ruleset version that adopted it. */
  decision?: string;
  reviewCriterionId?: string;
  reason?: string;
  acceptsPriorReference?: boolean;
  applicability?: 'required' | 'optional' | 'unconfigured';
  reviewInstruction?: string;
  admissionType?: 'regular' | 'transfer';
  /** Offers for which the norm leaves the activity optional, with the note shown ('' for none). */
  optionalFor?: Readonly<Record<string, string>>;
  /** New-student registration, required per offer and cycle by the intake configuration. */
  intake?: boolean;
  /** Checklist subject, filled by the catalogue. */
  group?: ActivityGroup;
  /** Category prepared for a new record of this activity. */
  defaultCategory?: string;
  /** Form blocks a record of this activity needs. */
  variant?: ActivityVariant;
}

/** Structural inputs shared by pure rules, saved historical states and previews. */
export interface CalendarPeriod {
  id: string;
  name?: string;
  start: string;
  end: string;
  targetDays?: number;
  association: PeriodAssociation;
}
export interface AssessmentSettings {
  offers: CalendarOffer[];
  legacySecondSemesterIntake?: boolean;
  year?: number;
  schemaVersion?: 4;
  rulesetVersion?: string;
}
export interface TeachingState extends AssessmentSettings {
  year: number;
  weekdays: number[];
  weekConfirmed: boolean;
  periods: CalendarPeriod[];
}
export interface ActivityState extends TeachingState {
  events: CalendarActivity[];
  campus?: string;
}
export interface ReviewEntry {
  id: string;
  status: string;
  reviewed: boolean;
  notes?: string;
}
export interface CalendarReview {
  baseIdentity?: string;
  rulesetVersion?: string;
  calendarId: string;
  calendarVersion: number;
  catalogueRevision: number;
  applicableNorm?: string;
  entries: ReviewEntry[];
}
export type DateRange = { start: string; end: string };
export type VacationPeriods = {
  firstStart: string;
  firstEnd: string;
  secondStart?: string;
  secondEnd?: string;
  thirdStart?: string;
  thirdEnd?: string;
};

export type CountingEvent = Pick<CalendarActivity, 'id' | 'kind' | 'start' | 'end' | 'offers'> & {
  evidence?: string;
  institutional?: boolean;
};
export type StageEvent = CountingEvent &
  Pick<CalendarActivity, 'requirementId' | 'assessmentAutoStart'>;
