import type { FunctionArgs } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

export const calendars = {
  get: (id: string) =>
    request(() => convex.query(functions.calendars.calendar, { id: id as Id<'calendars'> })),
  create: (body: FunctionArgs<typeof functions.calendars.createCalendar>['body']) =>
    request(() => convex.mutation(functions.calendars.createCalendar, { body })),
  save: (id: string, body: FunctionArgs<typeof functions.calendars.saveCalendar>['body']) =>
    request(() =>
      convex.mutation(functions.calendars.saveCalendar, { id: id as Id<'calendars'>, body }),
    ),
  synchronizeBase: (id: string, version: number) =>
    request(() =>
      convex.mutation(functions.calendars.synchronizeBase, { id: id as Id<'calendars'>, version }),
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
  generatePdf: (
    id: string,
    options: Omit<FunctionArgs<typeof functions.actions.pdf.generatePdf>, 'id'>,
  ) =>
    request(() =>
      convex.action(functions.actions.pdf.generatePdf, { id: id as Id<'calendars'>, ...options }),
    ),
  uploadHistory: (
    calendarId: string,
    file: Omit<FunctionArgs<typeof functions.actions.history.uploadHistory>, 'calendarId'>,
  ) =>
    request(() =>
      convex.action(functions.actions.history.uploadHistory, {
        calendarId: calendarId as Id<'calendars'>,
        ...file,
      }),
    ),
  restoreHistoryOriginal: (id: string, uploadId: string) =>
    request(() =>
      convex.action(functions.actions.history.restoreHistoryOriginal, {
        id: id as Id<'histories'>,
        uploadId,
      }),
    ),
  analyzeHistory: (id: string) =>
    request(() =>
      convex.action(functions.actions.history.analyzeHistory, {
        id: id as Id<'histories'>,
      }),
    ),
};
