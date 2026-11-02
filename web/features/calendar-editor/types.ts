import type { InstitutionalEventSnapshot } from '../../../src/domain/calendar/model.ts';
import type { calendars } from '../../shared/convex/calendars.ts';

export type CalendarRecord = Awaited<ReturnType<typeof calendars.get>>;
export type CalendarState = CalendarRecord['state'];
export type CalendarSave = Awaited<ReturnType<typeof calendars.save>>;
export type CalendarEvent = CalendarState['events'][number];
export type OfferId = string;
/**
 * Local date or institutional date projected in the editor. A local date always has its `scope`;
 * an institutional one keeps the offers it was copied with (plan, section 5.3).
 */
export type EditorEvent = Omit<CalendarEvent, 'scope'> &
  Partial<Pick<CalendarEvent, 'scope'>> &
  Pick<
    InstitutionalEventSnapshot,
    'institutional' | 'originalStart' | 'originalEnd' | 'offers' | 'evidence'
  >;
