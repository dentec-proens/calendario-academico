import { civilDate } from '../../../../src/domain/civil-date.ts';
import { parseDate, type CivilDate } from '#src/domain/civil-date.ts';
import {
  deadlineAdjustmentIssue,
  deadlineStanding,
  requirementDeadline,
  type DeadlineStanding,
} from '#src/domain/calendar/activities/deadlines.ts';
import type {
  ActivityPlanItem,
  AdmissionDestination,
  AssessmentSettings,
  CalendarPeriod,
  CalendarOffer,
  ProjectedDate,
} from '#src/domain/calendar/model.ts';
import { applicabilityFor } from '#src/domain/policies/registry.ts';
import { eventCategory } from '#src/domain/calendar/activities/categories.ts';
import { associationOffers, offerIds, offerFor } from '#src/domain/calendar/offers.ts';
import type { CalendarEvent, OfferId } from '../types.ts';

export type EventContext =
  | { kind: 'new' }
  | { kind: 'event'; eventId: string }
  /** A generated activity, by the key of its link (`activityKey`); `eventId` when editing a date. */
  | { kind: 'activity'; key: string; eventId?: string };
/** Campus events described by their purpose; each answer sets the count effect and category. */
export const eventTypes = [
  { id: 'holiday', label: 'Feriado (suspende aulas)', effect: 'exclude', category: 'feriado' },
  { id: 'recess', label: 'Recesso (suspende aulas)', effect: 'exclude', category: 'recesso' },
  {
    id: 'extra-day',
    label: 'Dia letivo extra ou reposição',
    effect: 'include',
    category: 'sabado',
  },
  {
    id: 'campus-event',
    label: 'Evento ou atividade do campus',
    effect: 'note',
    category: 'evento',
  },
  { id: 'deadline', label: 'Prazo', effect: 'note', category: 'prazo' },
  { id: 'notice', label: 'Publicação de edital', effect: 'note', category: 'prazo' },
] as const;
export type EventType = (typeof eventTypes)[number]['id'];

/** The answer matching a saved effect and category, or none when they were combined freely. */
export function eventTypeOf(event: {
  effect: string;
  category?: string;
  notice?: { admission?: unknown };
}): '' | EventType {
  const notice = Boolean(event.notice?.admission);
  return (
    eventTypes.find(
      (type) =>
        type.effect === event.effect &&
        type.category === event.category &&
        (type.category !== 'prazo' || (type.id === 'notice') === notice),
    )?.id ?? ''
  );
}

export interface EventValues {
  name: string;
  start: string;
  end: string;
  effect: '' | 'include' | 'exclude' | 'note';
  publicationStatus: '' | 'planned' | 'published';
  admissionType: '' | 'regular' | 'transfer';
  admissionYear: string;
  admissionTerm: 'annual' | 'first' | 'second';
  /**
   * Common destination of every offer of the date: a period ID, '' for not informed, or
   * `destinationsByOffer` to choose one period for each offer in `admissionPeriods`.
   */
  admissionPeriodId: string;
  /** Destination of each offer when `admissionPeriodId` is `destinationsByOffer`; '' for none. */
  admissionPeriods: Record<string, string>;
  adjustedDeadline: string;
  deadlineExtensionCause: '' | 'municipal-holiday' | 'municipal-recess';
  category: string;
  offers: OfferId[];
  hours: string;
  /** Interface answer to "O que é este evento?"; `effect` and `category` hold the record. */
  eventType: '' | EventType;
  /** **Data interna (art. 18)**: only offered while effect and category allow it. */
  internal: boolean;
}
/**
 * Destination answer that chooses one period for each offer: one notice may admit to offers
 * whose cycles have their own periods, and no single period would fit them all.
 */
export const destinationsByOffer = 'por-oferta';

/**
 * The single destination shared by every offer of a saved date, '' when none is informed, or
 * `destinationsByOffer` when offers have distinct destinations or some offer has none.
 */
export function commonDestination(
  destinations: readonly AdmissionDestination[],
  offers: OfferId[],
) {
  if (!destinations.length) return '';
  const periods = new Set(destinations.map((destination) => destination.periodId));
  const [periodId] = periods;
  return periods.size === 1 &&
    destinations.length === offers.length &&
    offers.every((offerId) => destinations.some((destination) => destination.offerId === offerId))
    ? periodId
    : destinationsByOffer;
}

/**
 * Destinations written by the form: the common destination for each chosen offer, or the period
 * chosen for each offer still chosen.
 */
export function draftDestinations(
  value: Pick<EventValues, 'admissionPeriodId' | 'admissionPeriods' | 'offers'>,
): AdmissionDestination[] {
  if (value.admissionPeriodId === destinationsByOffer)
    return value.offers.flatMap((offerId) => {
      const periodId = value.admissionPeriods[offerId];
      return periodId ? [{ offerId, periodId }] : [];
    });
  return value.admissionPeriodId
    ? value.offers.map((offerId) => ({ offerId, periodId: value.admissionPeriodId }))
    : [];
}

export const emptyEvent = (offers: OfferId[]): EventValues => ({
  name: '',
  start: '',
  end: '',
  effect: '',
  publicationStatus: '',
  admissionType: '',
  admissionYear: '',
  admissionTerm: 'annual',
  admissionPeriodId: '',
  admissionPeriods: {},
  adjustedDeadline: '',
  deadlineExtensionCause: '',
  category: 'recesso',
  offers,
  hours: '',
  eventType: '',
  internal: false,
});
export function eventValues(event: CalendarEvent): EventValues {
  const admission = event.notice?.admission;
  const dateOffers = event.offers;
  return {
    name: event.name,
    start: event.start,
    end: event.end,
    effect: event.effect,
    publicationStatus: event.notice?.publication ?? '',
    admissionType: admission?.type ?? '',
    admissionYear: admission ? String(admission.year) : '',
    admissionTerm: admission?.term ?? 'annual',
    admissionPeriodId: commonDestination(admission?.destinations ?? [], dateOffers),
    admissionPeriods: Object.fromEntries(
      (admission?.destinations ?? []).map((destination) => [
        destination.offerId,
        destination.periodId,
      ]),
    ),
    adjustedDeadline: event.deadlineAdjustment?.date ?? '',
    deadlineExtensionCause: event.deadlineExtensionCause ?? '',
    category: eventCategory(event),
    offers: dateOffers,
    hours: event.hours === undefined ? '' : String(event.hours),
    eventType: event.activity ? '' : eventTypeOf(event),
    internal: event.internal === true,
  };
}
/**
 * Notice metadata applies to linked records and to free events answered as a notice. Another
 * answer keeps it in the draft, so returning to "Publicação de edital" restores it, but not in
 * the record.
 */
export const noticeActive = (value: Pick<EventValues, 'eventType'>) =>
  !value.eventType || value.eventType === 'notice';

/**
 * Builds the date written by the form, without link: the date command decides it from the
 * context. Editing starts from the saved record, so fields the form does not show
 * survive. A manual edit ends the automatic stage distribution.
 */
export function eventFromValues(
  value: EventValues,
  target: {
    id: string;
    base?: CalendarEvent;
  },
): Omit<CalendarEvent, 'activity'> {
  if (!value.effect) throw new Error('Escolha o efeito na contagem.');
  const notice = noticeActive(value);
  const {
    assessmentAutoStart: _automatic,
    activity: _link,
    ...kept
  } = target.base ?? ({} as Partial<CalendarEvent>);
  const publication = (notice && value.publicationStatus) || undefined;
  const admission =
    notice && value.admissionType
      ? {
          type: value.admissionType,
          year: Number(value.admissionYear),
          term: value.admissionTerm,
          destinations: draftDestinations(value),
        }
      : undefined;
  return {
    ...kept,
    id: target.id,
    name: value.name,
    start: civilDate(value.start),
    end: civilDate(value.end),
    effect: value.effect,
    notice:
      publication || admission
        ? { ...(publication && { publication }), ...(admission && { admission }) }
        : undefined,
    deadlineAdjustment:
      notice && value.adjustedDeadline ? { date: civilDate(value.adjustedDeadline) } : undefined,
    category:
      target.base && !target.base.category && value.category === eventCategory(target.base)
        ? undefined
        : value.category,
    offers: value.offers,
    hours: value.hours ? Number(value.hours) : undefined,
    deadlineExtensionCause: value.deadlineExtensionCause || undefined,
    // Marking or unmarking keeps ID, dates and offers; the command checks eligibility.
    internal: value.internal ? true : undefined,
  };
}

/** Offers a record of this activity may cover: a stage belongs to exactly one offer. */
export function recordOffers(state: { offers: CalendarOffer[] }, requirement?: ActivityPlanItem) {
  const ids = offerIds(state);
  const requiredOffer = requirement?.offerId;
  return requiredOffer
    ? ids.filter((id) => id === requiredOffer)
    : ids.filter((id) => !requirement?.offerIds || requirement.offerIds.includes(id));
}

/** Values prepared for a new record of an activity, before any input. */
export function activityDraft(
  state: AssessmentSettings & { year: number; offers: CalendarOffer[]; periods: CalendarPeriod[] },
  requirement: ActivityPlanItem,
): EventValues {
  const valid = recordOffers(state, requirement);
  const pertinent = valid.filter(
    (modality) => applicabilityFor(state, requirement, modality) === 'required',
  );
  const modalities = pertinent.length
    ? pertinent
    : requirement.modalities?.length && !requirement.offerId
      ? valid.filter((modality) =>
          requirement.modalities?.includes(offerFor(state, modality)!.kind),
        )
      : valid;
  const ofTerm = (period: CalendarPeriod) => period.association.term === requirement.term;
  const destinationPeriod = state.periods.find(
    (period) =>
      ofTerm(period) &&
      modalities.every((modality) => associationOffers(period.association).includes(modality)),
  );
  // Without a period shared by every offer, each offer's own period of the cycle, when all have one.
  const byOffer = modalities.map(
    (modality) =>
      [
        modality,
        state.periods.find(
          (period) => ofTerm(period) && associationOffers(period.association).includes(modality),
        )?.id,
      ] as const,
  );
  const ownPeriods =
    !destinationPeriod &&
    requirement.admissionType === 'transfer' &&
    requirement.term &&
    byOffer.every(([, id]) => id)
      ? Object.fromEntries(byOffer as (readonly [string, string])[])
      : undefined;
  const notice = requirement.variant === 'admission-notice';
  return {
    ...emptyEvent(modalities),
    name: requirement.name,
    effect: 'note',
    admissionType: requirement.admissionType ?? '',
    admissionYear: notice
      ? String(requirement.admissionType === 'regular' ? state.year + 1 : state.year)
      : '',
    admissionTerm: requirement.term ?? 'annual',
    admissionPeriodId: destinationPeriod?.id ?? (ownPeriods ? destinationsByOffer : ''),
    admissionPeriods: ownPeriods ?? {},
    publicationStatus: notice ? 'planned' : '',
    category: requirement.defaultCategory ?? 'prazo',
  };
}

/** The value of a date field once typed in full; a year still growing (20270) is not a date yet. */
const typedDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');

/**
 * Whether the activity already answers what these values say about its notice, so the form can state
 * them. Any other saved answer stays in the fields, where it can be corrected.
 */
export function noticeAnswered(
  values: Pick<
    EventValues,
    'admissionType' | 'admissionYear' | 'admissionTerm' | 'admissionPeriodId'
  >,
  requirement: Pick<ActivityPlanItem, 'term'> | undefined,
  year: number,
) {
  return (
    values.admissionType === 'regular' &&
    values.admissionYear === String(year + 1) &&
    values.admissionTerm === (requirement?.term ?? 'annual') &&
    !values.admissionPeriodId
  );
}

const standingOrder: DeadlineStanding[] = ['within', 'adjusted', 'late'];

/**
 * The deadline of a regular admission notice as the form shows it while the date is typed, by the
 * same rules as the evaluation. With several offers the strictest one decides; `limit` is null
 * while an extension cannot be determined.
 */
export function publicationDeadlineView(
  state: Parameters<typeof requirementDeadline>[0],
  requirement: ActivityPlanItem | undefined,
  events: readonly ProjectedDate[],
  values: Pick<EventValues, 'end' | 'adjustedDeadline' | 'offers'>,
) {
  if (requirement?.admissionType !== 'regular' || !requirement.deadline) return undefined;
  const deadlines = (values.offers.length ? values.offers : ['']).map((offer) =>
    requirementDeadline(state, requirement, events, offer),
  );
  const dates = deadlines.map((deadline) => deadline?.date ?? null);
  const limit = dates.includes(null) ? null : dates.map(String).sort()[0]!;
  const typedEnd = typedDate(values.end);
  const adjusted = typedDate(values.adjustedDeadline);
  const end = typedEnd as CivilDate;
  const event = {
    end,
    deadlineAdjustment: adjusted ? { date: adjusted as CivilDate } : undefined,
  };
  const standing: DeadlineStanding = typedEnd
    ? standingOrder[
        Math.max(
          ...deadlines.map((deadline) =>
            standingOrder.indexOf(deadlineStanding(requirement, deadline, event)),
          ),
        )
      ]!
    : 'within';
  return {
    original: requirement.deadline,
    limit,
    extended: limit !== requirement.deadline,
    standing,
    daysLate: limit && typedEnd > limit ? (parseDate(end) - parseDate(limit)) / 86400000 : 0,
    issue: typedEnd ? deadlineAdjustmentIssue(requirement, event) : undefined,
  };
}
