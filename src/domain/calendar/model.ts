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
  intake?: Partial<Record<AcademicTerm, IntakeConfiguration>>;
  organizationBasis?: string;
}
/**
 * Assessment stages of an offer (plan, section 5.5): a total reported while the organization has
 * no confirmed cycle (`reported`, only with `a-classificar`), or the stages of each cycle of a
 * defined organization (`defined`). Confirming the organization turns `reported` into `defined`.
 */
export type OfferStages =
  { status: 'reported'; count: 2 | 3 | 4 } | { status: 'defined'; perTerm: number };
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
/** Period where the students admitted by a notice start, for one offer of the date. */
export interface AdmissionDestination {
  offerId: string;
  periodId: string;
}
/** Purpose of an admission notice (plan, section 5.4). */
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
export interface IntakeConfiguration {
  status: 'unknown' | 'yes' | 'no';
  required?: boolean;
}
/** How a date affects the count of school days (arts. 4º and 5º). */
export type EventEffect = 'include' | 'exclude' | 'note';
export const eventEffects: readonly EventEffect[] = ['include', 'exclude', 'note'];
/**
 * Offers a local date reaches (plan, section 5.3). `offers` is always listed and drives the day
 * count; `confirmed` records that the campus chose them (saving the date form). Adding an offer to
 * the calendar neither extends nor confirms an existing scope. Coverage under a policy with
 * `explicitRecordOffers` counts only a confirmed scope.
 */
export interface EventScope {
  offers: string[];
  confirmed: boolean;
}
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
  deadlineAdjustment?: { date: CivilDate; reviewed: boolean };
}
/** A local date of the calendar (`state.events`). */
export interface CalendarEvent extends DateFields {
  scope: EventScope;
  /** Activity the date serves (plan, section 5.1); absent for a campus date. */
  activity?: ActivityRef;
  /**
   * Date of internal organization of the campus (art. 18; plan, section 4.5): only a date of the
   * campus with effect `note` and an allowed effective category (`internalDateIssue`). Absent
   * means official; the v5 conversion never creates it.
   */
  internal?: true;
}
/**
 * Institutional date copied into a calendar (`institutionalSnapshot`) or projected in the editor.
 * Its scope stays by offer type (`modalities`) or by the offers listed when it was copied
 * (`offers`); it has no confirmation. `originalStart`/`originalEnd` keep the base date when an
 * observance moved it; local dates (`state.events`) never carry these fields.
 */
export interface InstitutionalEventSnapshot extends DateFields {
  offers?: string[];
  evidence?: string;
  source?: string;
  modalities?: string[];
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
> & { scope?: EventScope };
export type StageEvent = CountingEvent & Pick<CalendarEvent, 'activity' | 'assessmentAutoStart'>;
/** A local stage date, with its listed scope. */
export type LocalStageEvent = StageEvent & Pick<CalendarEvent, 'scope'>;

/** An institutional date in the editor projection, marked by its container. */
export type InstitutionalDate = InstitutionalEventSnapshot & { institutional: true };
/** A date of the editor projection (`projectDates`): local or institutional. */
export type ProjectedDate = CalendarEvent | InstitutionalDate;
/** A local date of the projection: the origin comes only from the container (plan, 5.2). */
export const isLocalDate = <T extends ProjectedDate>(
  event: T,
): event is Extract<T, CalendarEvent> =>
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
