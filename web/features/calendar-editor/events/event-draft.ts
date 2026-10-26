import type { CalendarEvent, Modality } from '../types.ts';

export type EventContext =
  | { kind: 'new' }
  | { kind: 'event'; eventId: string }
  | { kind: 'activity'; requirementId: string }
  | { kind: 'history'; historyId: string; candidateKey: string };
export interface EventValues {
  name: string;
  start: string;
  end: string;
  kind: 'include' | 'exclude' | 'note';
  category: string;
  evidence: string;
  requirementId: string;
  modalities: Modality[];
  hours: string;
  confirmed: boolean;
}
export const emptyEvent = (modalities: Modality[]): EventValues => ({
  name: '',
  start: '',
  end: '',
  kind: 'exclude',
  category: 'recesso',
  evidence: '',
  requirementId: '',
  modalities,
  hours: '',
  confirmed: false,
});
export function eventValues(event: CalendarEvent, modalities: Modality[]): EventValues {
  return {
    name: event.name,
    start: event.start,
    end: event.end,
    kind: event.kind,
    category: event.category || 'institucional',
    evidence: event.evidence,
    requirementId: event.requirementId || '',
    modalities: event.modalities?.length ? event.modalities : modalities,
    hours: event.hours === undefined ? '' : String(event.hours),
    confirmed: false,
  };
}
