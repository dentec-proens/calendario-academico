import { type CivilDate } from '../civil-date.ts';
import type { ActivityGroup, ActivityVariant } from './activities/metadata.ts';

/** Shared contracts for calendar dates, generated activities and the operational catalogue. */
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
export type PeriodAssociation =
  { status: 'defined'; offers: string[]; term: AcademicTerm } | { status: 'a-classificar' };
/** Stored format version of a calendar's content (`calendarContents.state`). */
export const calendarSchemaVersion = 5;
/** Version five persists offer configuration, never its derived summaries. */
export interface CalendarContent {
  schemaVersion: typeof calendarSchemaVersion;
  rulesetVersion?: string;
  offers: CalendarOffer[];
  weekdays: number[];
  weekConfirmed: boolean;
  periods: CalendarPeriod[];
  events: CalendarEvent[];
  observanceDates?: Record<string, CivilDate>;
  teacherVacations?: VacationPeriods;
}
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
/** How a date affects the count of school days (arts. 4º and 5º). */
export type EventEffect = 'include' | 'exclude' | 'note';
export const eventEffects: readonly EventEffect[] = ['include', 'exclude', 'note'];
export interface CalendarEvent {
  id: string;
  name: string;
  start: CivilDate;
  end: CivilDate;
  effect: EventEffect;
  category?: string;
  requirementId?: string;
  offers?: string[];
  hours?: number;
  assessmentAutoStart?: CivilDate;
  deadlineExtensionCause?: 'municipal-holiday' | 'municipal-recess';
  publicationStatus?: 'planned' | 'published';
  admission?: Admission;
  deadlineAdjustment?: { date: CivilDate; reviewed: boolean };
}
/**
 * Institutional date copied into a calendar (`institutionalSnapshot`) or projected in the editor.
 * `originalStart`/`originalEnd` keep the base date when an observance moved it; local dates
 * (`state.events`) never carry these fields.
 */
export interface InstitutionalEventSnapshot extends CalendarEvent {
  evidence?: string;
  source?: string;
  modalities?: string[];
  originalStart?: CivilDate;
  originalEnd?: CivilDate;
  institutional?: boolean;
}

export interface ActivityPlanItem {
  id: string;
  name: string;
  required?: boolean;
  deadline?: CivilDate;
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
  /** Subject that groups the activity in the plan, filled by the catalogue. */
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
  start: CivilDate;
  end: CivilDate;
  targetDays?: number;
  association: PeriodAssociation;
}
export interface AssessmentSettings {
  offers: CalendarOffer[];
  year?: number;
  schemaVersion?: typeof calendarSchemaVersion;
  rulesetVersion?: string;
}
export interface TeachingState extends AssessmentSettings {
  year: number;
  weekdays: number[];
  weekConfirmed: boolean;
  periods: CalendarPeriod[];
}
export interface ActivityState extends TeachingState {
  observanceDates?: Record<string, CivilDate>;
  events: CalendarEvent[];
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
  submissionId?: string;
  applicableNorm?: string;
  entries: ReviewEntry[];
}
export type DateRange = { start: CivilDate; end: CivilDate };
export type VacationPeriods = {
  firstStart: CivilDate;
  firstEnd: CivilDate;
  secondStart?: CivilDate;
  secondEnd?: CivilDate;
  thirdStart?: CivilDate;
  thirdEnd?: CivilDate;
};

/** A local or institutional date as the day count reads it. */
export type CountingEvent = Pick<
  InstitutionalEventSnapshot,
  'id' | 'effect' | 'start' | 'end' | 'offers' | 'evidence' | 'institutional'
>;
export type StageEvent = CountingEvent &
  Pick<CalendarEvent, 'requirementId' | 'assessmentAutoStart'>;

/**
 * Editor projection of a calendar's dates. The origin comes only from the container: every date
 * of the institutional base (snapshot or catalogue projection) is `institutional`, and no local
 * date (`state.events`) is, whatever its ID. The `inst:` prefix stays a key and observance target.
 */
export function projectDates<
  I extends Omit<InstitutionalEventSnapshot, 'institutional'>,
  L extends CalendarEvent,
>(institutional: readonly I[], local: readonly L[]) {
  return [
    ...institutional.map((event) => ({ ...event, institutional: true as const })),
    ...local.map((event) => {
      if (!('institutional' in event)) return event;
      const { institutional: _origin, ...rest } = event as L & { institutional?: unknown };
      return rest as L;
    }),
  ];
}
