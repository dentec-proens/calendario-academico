import type { DomainState } from '../../../convex/validators.ts';
import type { calendars } from '../../shared/convex/calendars.ts';

export type CalendarRecord = Omit<Awaited<ReturnType<typeof calendars.get>>, 'state'> & {
  state: CalendarState;
};
export type CalendarState = DomainState;
export type CalendarSave = Omit<Awaited<ReturnType<typeof calendars.save>>, 'state'> & {
  state: CalendarState;
};
export type CalendarEvent = CalendarState['events'][number];
export type Modality = CalendarState['offer'];
export type EditorEvent = CalendarEvent & {
  institutional?: boolean;
  originalStart?: string;
  originalEnd?: string;
};
