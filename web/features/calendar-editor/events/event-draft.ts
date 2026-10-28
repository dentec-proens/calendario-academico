import type {
  ActivityRequirement,
  AssessmentSettings,
  CalendarPeriod,
} from '../../../../src/domain/calendar/model.ts';
import { applicabilityFor } from '../../../../src/domain/calendar/policies/resolve.ts';
import { eventCategory } from '../../../../src/domain/calendar/activities/categories.ts';
import type { CalendarEvent, Modality } from '../types.ts';

export type EventContext =
  | { kind: 'new' }
  | { kind: 'event'; eventId: string }
  | { kind: 'activity'; requirementId: string; eventId?: string };
/** Campus events described by their purpose; each answer sets the count effect and category. */
export const eventTypes = [
  { id: 'holiday', label: 'Feriado (suspende aulas)', kind: 'exclude', category: 'feriado' },
  { id: 'recess', label: 'Recesso (suspende aulas)', kind: 'exclude', category: 'recesso' },
  { id: 'extra-day', label: 'Dia letivo extra ou reposição', kind: 'include', category: 'sabado' },
  { id: 'campus-event', label: 'Evento ou atividade do campus', kind: 'note', category: 'evento' },
  { id: 'deadline', label: 'Prazo', kind: 'note', category: 'prazo' },
  { id: 'notice', label: 'Publicação de edital', kind: 'note', category: 'prazo' },
] as const;
export type EventType = (typeof eventTypes)[number]['id'];

/** The answer matching a saved effect and category, or none when they were combined freely. */
export function eventTypeOf(event: {
  kind: string;
  category?: string;
  admission?: unknown;
  admissionType?: string;
}): '' | EventType {
  const notice = Boolean(event.admission || event.admissionType);
  return (
    eventTypes.find(
      (type) =>
        type.kind === event.kind &&
        type.category === event.category &&
        (type.category !== 'prazo' || (type.id === 'notice') === notice),
    )?.id ?? ''
  );
}

export interface EventValues {
  name: string;
  start: string;
  end: string;
  kind: '' | 'include' | 'exclude' | 'note';
  recordType: 'event' | 'prior-reference';
  publicationStatus: '' | 'planned' | 'published';
  admissionType: '' | 'regular' | 'transfer';
  admissionYear: string;
  admissionTerm: 'annual' | 'first' | 'second';
  admissionPeriodId: string;
  adjustedDeadline: string;
  deadlineExtensionCause: '' | 'municipal-holiday' | 'municipal-recess';
  category: string;
  requirementId: string;
  modalities: Modality[];
  hours: string;
  /** Interface answer to "O que é este evento?"; `kind` and `category` hold the record. */
  eventType: '' | EventType;
}
export const emptyEvent = (modalities: Modality[]): EventValues => ({
  name: '',
  start: '',
  end: '',
  kind: '',
  recordType: 'event',
  publicationStatus: '',
  admissionType: '',
  admissionYear: '',
  admissionTerm: 'annual',
  admissionPeriodId: '',
  adjustedDeadline: '',
  deadlineExtensionCause: '',
  category: 'recesso',
  requirementId: '',
  modalities,
  hours: '',
  eventType: '',
});
export function eventValues(event: CalendarEvent, modalities: Modality[]): EventValues {
  return {
    name: event.name,
    start: event.start,
    end: event.end,
    kind: event.kind,
    recordType: event.recordType === 'prior-reference' ? 'prior-reference' : 'event',
    publicationStatus: event.publicationStatus ?? '',
    admissionType: event.admission?.type ?? '',
    admissionYear: event.admission ? String(event.admission.year) : '',
    admissionTerm: event.admission?.term ?? 'annual',
    admissionPeriodId: event.admission?.periodId ?? '',
    adjustedDeadline: event.deadlineAdjustment?.date ?? '',
    deadlineExtensionCause: event.deadlineExtensionCause ?? '',
    category: eventCategory(event),
    requirementId: event.requirementId || '',
    modalities: event.modalities?.length ? event.modalities : modalities,
    hours: event.hours === undefined ? '' : String(event.hours),
    eventType: event.requirementId ? '' : eventTypeOf(event),
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
 * Builds the record written by the form. Editing starts from the saved record, so fields the
 * form does not show survive, and an absent document intent stays absent. A manual edit ends
 * the automatic stage distribution.
 */
export function eventFromValues(
  value: EventValues,
  target: {
    id: string;
    base?: CalendarEvent;
  },
): CalendarEvent {
  if (!value.kind) throw new Error('Escolha o efeito na contagem.');
  const notice = noticeActive(value);
  // An unchanged adjustment keeps its institutional review; a new date needs another.
  const adjustment = target.base?.deadlineAdjustment;
  const { assessmentAutoStart: _automatic, ...kept } =
    target.base ?? ({} as Partial<CalendarEvent>);
  return {
    ...kept,
    id: target.id,
    name: value.name,
    start: value.start,
    end: value.end,
    kind: value.kind,
    recordType:
      target.base && !target.base.recordType && value.recordType === 'event'
        ? undefined
        : value.recordType,
    publicationStatus: (notice && value.publicationStatus) || undefined,
    admission:
      notice && value.admissionType
        ? {
            type: value.admissionType,
            year: Number(value.admissionYear),
            term: value.admissionTerm,
            periodId: value.admissionPeriodId || undefined,
          }
        : undefined,
    deadlineAdjustment:
      notice && value.adjustedDeadline
        ? adjustment?.date === value.adjustedDeadline
          ? { date: adjustment.date, reviewed: adjustment.reviewed }
          : { date: value.adjustedDeadline, reviewed: false }
        : undefined,
    category:
      target.base && !target.base.category && value.category === eventCategory(target.base)
        ? undefined
        : value.category,
    modalities: value.modalities,
    requirementId: value.requirementId || undefined,
    hours: value.hours ? Number(value.hours) : undefined,
    deadlineExtensionCause: value.deadlineExtensionCause || undefined,
  };
}

/** Offers a record of this activity may cover: a stage belongs to exactly one offer. */
export function recordOffers(state: { modalities: Modality[] }, requirement?: ActivityRequirement) {
  return requirement?.modality
    ? state.modalities.filter((modality) => modality === requirement.modality)
    : state.modalities;
}

/** Values prepared for a new record of an activity, before any input. */
export function activityDraft(
  state: AssessmentSettings & { year: number; modalities: Modality[]; periods: CalendarPeriod[] },
  requirement: ActivityRequirement,
): EventValues {
  const valid = recordOffers(state, requirement);
  const pertinent = valid.filter(
    (modality) => applicabilityFor(state, requirement, modality) === 'required',
  );
  const modalities = pertinent.length
    ? pertinent
    : requirement.modalities?.length && !requirement.modality
      ? valid.filter((modality) => requirement.modalities?.includes(modality))
      : valid;
  const destinationPeriod = state.periods.find(
    (period) =>
      period.association?.status === 'defined' &&
      period.association.term === requirement.term &&
      modalities.every(
        (modality) =>
          period.association?.status === 'defined' &&
          period.association.modalities.includes(modality),
      ),
  );
  const notice = requirement.variant === 'admission-notice';
  return {
    ...emptyEvent(modalities),
    name: requirement.name,
    requirementId: requirement.id,
    kind: 'note',
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
