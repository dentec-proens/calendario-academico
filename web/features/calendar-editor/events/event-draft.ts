import type { CalendarEvent, Modality } from '../types.ts';

export type EventContext =
  | { kind: 'new' }
  | { kind: 'event'; eventId: string }
  | { kind: 'activity'; requirementId: string; eventId?: string }
  | {
      kind: 'history';
      historyId: string;
      candidateKey: string;
      intent: 'reference' | 'new' | 'link';
      eventId?: string;
    };
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
  adjustmentEvidence: string;
  deadlineExtensionCause: '' | 'municipal-holiday' | 'municipal-recess';
  category: string;
  evidence: string;
  requirementId: string;
  modalities: Modality[];
  hours: string;
  confirmed: boolean;
  provenanceKey: string;
  historyWarning: string;
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
  adjustmentEvidence: '',
  deadlineExtensionCause: '',
  category: 'recesso',
  evidence: '',
  requirementId: '',
  modalities,
  hours: '',
  confirmed: false,
  provenanceKey: '',
  historyWarning: '',
});
export function eventValues(event: CalendarEvent, modalities: Modality[]): EventValues {
  return {
    name: event.name,
    start: event.start,
    end: event.end,
    kind: event.kind,
    recordType: event.recordType ?? 'event',
    publicationStatus: event.publicationStatus ?? '',
    admissionType: event.admission?.type ?? '',
    admissionYear: event.admission ? String(event.admission.year) : '',
    admissionTerm: event.admission?.term ?? 'annual',
    admissionPeriodId: event.admission?.periodId ?? '',
    adjustedDeadline: event.deadlineAdjustment?.date ?? '',
    adjustmentEvidence: event.deadlineAdjustment?.evidence ?? '',
    deadlineExtensionCause: event.deadlineExtensionCause ?? '',
    category: event.category || 'institucional',
    evidence: event.evidence,
    requirementId: event.requirementId || '',
    modalities: event.modalities?.length ? event.modalities : modalities,
    hours: event.hours === undefined ? '' : String(event.hours),
    confirmed: false,
    provenanceKey: '',
    historyWarning: '',
  };
}
