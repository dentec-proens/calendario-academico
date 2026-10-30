import { calendarRecordDates, calendarSaveDates } from './calendar-dates.ts';
import type { FunctionArgs } from 'convex/server';
import type { Infer } from 'convex/values';
import type { saveInput } from '../../../convex/contracts.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

export const calendars = {
  get: (id: string) =>
    request(async () => {
      const record = await convex.query(functions.calendars.calendar, {
        id: id as Id<'calendars'>,
      });
      return calendarRecordDates(record);
    }),
  create: (body: FunctionArgs<typeof functions.calendars.createCalendar>['body']) =>
    request(() =>
      convex.mutation(functions.calendars.createCalendar, { body }).then(calendarRecordDates),
    ),
  save: (id: string, body: Infer<typeof saveInput>) =>
    request(() =>
      convex
        .mutation(functions.calendars.saveCalendar, { id: id as Id<'calendars'>, body })
        .then(calendarSaveDates),
    ),
  synchronizeBase: (id: string, version: number) =>
    request(() =>
      convex
        .mutation(functions.calendars.synchronizeBase, { id: id as Id<'calendars'>, version })
        .then(calendarRecordDates),
    ),
  remove: (id: string, version: number) =>
    request(() =>
      convex.mutation(functions.calendars.deleteCalendar, { id: id as Id<'calendars'>, version }),
    ),
  restore: (id: string) =>
    request(() =>
      convex.mutation(functions.calendars.restoreCalendar, { id: id as Id<'calendars'> }),
    ),
  makeDefinitive: (id: string, version: number) =>
    request(() =>
      convex.mutation(functions.calendars.makeDefinitive, { id: id as Id<'calendars'>, version }),
    ),
};
