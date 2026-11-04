import type { InstitutionalEventSnapshot } from '../../../src/domain/calendar/model.ts';
import type { calendars } from '../../shared/convex/calendars.ts';

export type CalendarRecord = Awaited<ReturnType<typeof calendars.get>>;
export type CalendarState = CalendarRecord['state'];
export type CalendarSave = Awaited<ReturnType<typeof calendars.save>>;
export type CalendarEvent = CalendarState['events'][number];
export type OfferId = string;
/** Local date or institutional date projected in the editor: both list their offers. */
export type EditorEvent = CalendarEvent &
  Pick<InstitutionalEventSnapshot, 'institutional' | 'originalStart' | 'originalEnd' | 'evidence'>;
