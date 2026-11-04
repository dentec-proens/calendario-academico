import { civilDate } from '../../../../src/domain/civil-date.ts';
import type {
  ActivityPlanItem,
  AdmissionDestination,
  AssessmentSettings,
  CalendarPeriod,
  CalendarOffer,
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
   * `keptDestinations` to keep the distinct destinations already saved by offer.
   */
  admissionPeriodId: string;
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
/** Destination answer that keeps the saved destinations by offer. */
export const keptDestinations = 'por-oferta';

/**
 * The single destination shared by every offer of a saved date, '' when none is informed, or
 * `keptDestinations` when offers have distinct destinations or some offer has none.
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
    : keptDestinations;
}

/**
 * Destinations written by the form: the common destination for each chosen offer, or the saved
 * destinations of the offers still chosen.
 */
export function draftDestinations(
  value: Pick<EventValues, 'admissionPeriodId' | 'offers'>,
  base?: CalendarEvent,
): AdmissionDestination[] {
  if (value.admissionPeriodId === keptDestinations)
    return (base?.notice?.admission?.destinations ?? []).filter((destination) =>
      value.offers.includes(destination.offerId),
    );
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
          destinations: draftDestinations(value, target.base),
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
  const destinationPeriod = state.periods.find(
    (period) =>
      period.association.term === requirement.term &&
      modalities.every((modality) => associationOffers(period.association).includes(modality)),
  );
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
    admissionPeriodId: destinationPeriod?.id ?? '',
    publicationStatus: notice ? 'planned' : '',
    category: requirement.defaultCategory ?? 'prazo',
  };
}
