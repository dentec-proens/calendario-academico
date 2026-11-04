import { type CivilDate } from '../civil-date.ts';
import type { ActivityGroup, ActivityVariant } from './activities/metadata.ts';
import type { ActivityRef } from './activities/activity-ref.ts';

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
  stages?: OfferStages;
  scope?: { status: 'covered' | 'own-regulation' };
  /** Cycles where the campus requires new-student registration by a local rule. */
  intake?: Partial<Record<AcademicTerm, true>>;
}
/** Assessment stages of each cycle of the offer's organization. */
export interface OfferStages {
  status: 'defined';
  perTerm: number;
}
export interface PeriodAssociation {
  status: 'defined';
  offers: string[];
  term: AcademicTerm;
}
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
/** Period where the students admitted by a notice start, for one offer of the date. */
export interface AdmissionDestination {
  offerId: string;
  periodId: string;
}
/** Purpose of an admission notice. */
export interface Admission {
  type: 'regular' | 'transfer';
  year: number;
  term: AcademicTerm;
  /**
   * Destination by offer; empty means not informed. A period removed from the calendar or no
   * longer associated with the offer is kept and diagnosed (`noticeDestinationIssues`), never
   * dropped or reassigned.
   */
  destinations: AdmissionDestination[];
}
export type PublicationStatus = 'planned' | 'published';
/** Notice data of a date: publication status and admission purpose, each optional. */
export interface AdmissionNotice {
  publication?: PublicationStatus;
  admission?: Admission;
}
/** How a date affects the count of school days (arts. 4º and 5º). */
export type EventEffect = 'include' | 'exclude' | 'note';
export const eventEffects: readonly EventEffect[] = ['include', 'exclude', 'note'];
/** Fields shared by local dates and institutional snapshot entries. */
export interface DateFields {
  id: string;
  name: string;
  start: CivilDate;
  end: CivilDate;
  effect: EventEffect;
  category?: string;
  hours?: number;
  assessmentAutoStart?: CivilDate;
  deadlineExtensionCause?: 'municipal-holiday' | 'municipal-recess';
  notice?: AdmissionNotice;
  deadlineAdjustment?: { date: CivilDate };
}
/** A local date of the calendar (`state.events`). */
export interface CalendarEvent extends DateFields {
  /** Offers the date reaches: never empty. A linked date counts as fulfilment for every one. */
  offers: string[];
  /** Activity the date serves; absent for a campus date. */
  activity?: ActivityRef;
  /**
   * Date of internal organization of the campus (art. 18): only a date of the
   * campus with effect `note` and an allowed effective category (`internalDateIssue`). Absent
   * means official; the v5 conversion never creates it.
   */
  internal?: true;
}
/**
 * Institutional date copied into a calendar (`institutionalSnapshot`) or projected in the editor.
 * It lists the offers it reached when it was copied (`offers`, never empty).
 * `originalStart`/`originalEnd` keep the base date when an observance moved it; local dates
 * (`state.events`) never carry these fields.
 */
export interface InstitutionalEventSnapshot extends DateFields {
  offers: string[];
  evidence?: string;
  source?: string;
  originalStart?: CivilDate;
  originalEnd?: CivilDate;
  institutional?: boolean;
}

export interface ActivityPlanItem {
  id: string;
  /** Link a date of this row carries: the declaration, its base and the row's slot. */
  activity: ActivityRef;
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
export type StageEvent = CountingEvent & Pick<CalendarEvent, 'activity' | 'assessmentAutoStart'>;

/** An institutional date in the editor projection, marked by its container. */
export type InstitutionalDate = InstitutionalEventSnapshot & { institutional: true };
/** A date of the editor projection (`projectDates`): local or institutional. */
export type ProjectedDate = CalendarEvent | InstitutionalDate;
/** A local date of the projection: the origin comes only from the container. */
export const isLocalDate = <T extends ProjectedDate>(
  event: T,
): event is Exclude<T, { institutional: true }> =>
  (event as { institutional?: boolean }).institutional !== true;

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
