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
  updateIdentity: (
    id: string,
    args: Omit<FunctionArgs<typeof functions.calendars.updateCalendarIdentity>, 'id'>,
  ) =>
    request(() =>
      convex.mutation(functions.calendars.updateCalendarIdentity, {
        id: id as Id<'calendars'>,
        ...args,
      }),
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
  restore: (id: string, version: number) =>
    request(() =>
      convex.mutation(functions.calendars.restoreCalendar, { id: id as Id<'calendars'>, version }),
    ),
  transition: (
    id: string,
    args: Omit<FunctionArgs<typeof functions.calendars.transitionCalendar>, 'id'>,
  ) =>
    request(() =>
      convex.mutation(functions.calendars.transitionCalendar, {
        id: id as Id<'calendars'>,
        ...args,
      }),
    ),
  createVersion: (id: string) =>
    request(() =>
      convex
        .mutation(functions.calendars.createCalendarVersion, { id: id as Id<'calendars'> })
        .then(calendarRecordDates),
    ),
};
