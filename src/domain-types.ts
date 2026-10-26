/** Shared contracts for calendar activities and the operational checklist. */
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
  historicalSource?: { historyId: string; page: number; candidateKey: string };
}

export interface ActivityRequirement {
  id: string;
  name: string;
  required?: boolean;
  deadline?: string;
  minHours?: number;
  month?: number;
  modality?: string;
}

/** Structural inputs shared by pure rules, saved historical states and previews. */
export interface CalendarPeriod {
  id: string;
  name?: string;
  start: string;
  end: string;
  targetDays?: number;
}
export interface AssessmentSettings {
  offer?: string;
  modalities?: string[];
  regime?: string;
  year?: number;
  assessmentStagesByModality?: Record<string, number>;
  secondSemesterIntake?: boolean;
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
