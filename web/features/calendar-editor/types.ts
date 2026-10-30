import { type CivilDate } from '../../../src/domain/civil-date.ts';
import type { calendars } from '../../shared/convex/calendars.ts';

export type CalendarRecord = Awaited<ReturnType<typeof calendars.get>>;
export type CalendarState = CalendarRecord['state'];
export type CalendarSave = Awaited<ReturnType<typeof calendars.save>>;
export type CalendarEvent = CalendarState['events'][number];
export type OfferId = string;
export type EditorEvent = CalendarEvent & {
  institutional?: boolean;
  originalStart?: CivilDate;
  originalEnd?: CivilDate;
};
