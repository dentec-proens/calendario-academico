import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../../convex/_generated/api.js';
import { readCalendarDates, readActivityDates } from '#src/domain/calendar/civil-dates.ts';

export function calendarRecordDates(record: FunctionReturnType<typeof api.calendars.calendar>) {
  return {
    ...record,
    state: readCalendarDates(record.state),
    institutionalEvents: record.institutionalEvents.map(readActivityDates),
    institutionalSnapshot: record.institutionalSnapshot.map(readActivityDates),
  };
}

export function calendarSaveDates(saved: FunctionReturnType<typeof api.calendars.saveCalendar>) {
  return {
    ...saved,
    state: readCalendarDates(saved.state),
    base: { ...saved.base, events: saved.base.events.map(readActivityDates) },
  };
}
