/** Shared contracts for calendar activities and the operational checklist. */
export type AcademicTerm = 'annual' | 'first' | 'second';
export type Organization = 'anual' | 'semestral' | 'a-classificar';
export type PeriodAssociation =
  { status: 'defined'; modalities: string[]; term: AcademicTerm } | { status: 'a-classificar' };
export interface Admission {
  type: 'regular' | 'transfer';
  year: number;
  term: AcademicTerm;
  periodId?: string;
}
export interface IntakeConfiguration {
  status: 'unknown' | 'yes' | 'no';
  source?: string;
  required?: boolean;
}
export interface CalendarConversion {
  from: 2;
  organization: 'classified' | 'pending';
  legacySecondSemesterIntake?: boolean;
}
export interface CalendarActivity {
  id: string;
  name: string;
  start: string;
  end: string;
  kind: string;
  evidence: string;
  category?: string;
  requirementId?: string;
  modalities?: string[];
  hours?: number;
  days?: number;
  originalStart?: string;
  originalEnd?: string;
  assessmentAutoStart?: string;
  deadlineExtensionCause?: 'municipal-holiday' | 'municipal-recess';
  recordType?: 'event' | 'prior-reference';
  publicationStatus?: 'planned' | 'published';
  admission?: Admission;
  deadlineAdjustment?: { date: string; evidence: string; reviewed: boolean };
  historicalSource?: { historyId: string; page: number; candidateKey: string; analysisId?: string };
}

export interface ActivityRequirement {
  id: string;
  name: string;
  required?: boolean;
  deadline?: string;
  deadlinePolicy?: 'reference' | 'fixed';
  minHours?: number;
  month?: number;
  modality?: string;
  modalities?: string[];
  term?: AcademicTerm;
  periodId?: string;
  basis?: string;
  reviewCriterionId?: string;
  reason?: string;
  acceptsPriorReference?: boolean;
  applicability?: 'required' | 'optional' | 'unconfigured';
  reviewInstruction?: string;
  admissionType?: 'regular' | 'transfer';
}

/** Structural inputs shared by pure rules, saved historical states and previews. */
export interface CalendarPeriod {
  id: string;
  name?: string;
  start: string;
  end: string;
  targetDays?: number;
  association?: PeriodAssociation;
}
export interface AssessmentSettings {
  offer?: string;
  modalities?: string[];
  regime?: string;
  year?: number;
  assessmentStagesByModality?: Record<string, number>;
  secondSemesterIntake?: boolean;
  schemaVersion?: number;
  rulesetVersion?: string;
  organizationByModality?: Record<string, Organization>;
  intakeByModality?: Record<string, Record<string, IntakeConfiguration>>;
  conversion?: CalendarConversion;
  scopeConfirmation?: { status: 'covered' | 'own-regulation'; source: string };
}
export interface TeachingState extends AssessmentSettings {
  year: number;
  regime: string;
  weekdays: number[];
  weekConfirmed: boolean;
  weekEvidence?: string;
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

export type CountingEvent = Pick<
  CalendarActivity,
  'id' | 'kind' | 'start' | 'end' | 'modalities'
> & { evidence?: string };
export type StageEvent = CountingEvent &
  Pick<CalendarActivity, 'requirementId' | 'assessmentAutoStart'>;
