import type { FunctionArgs } from 'convex/server';
import type { Infer } from 'convex/values';
import type { saveInputV4 } from '../../../convex/contracts.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

export const calendars = {
  get: (id: string) =>
    request(() => convex.query(functions.calendars.calendar, { id: id as Id<'calendars'> })),
  create: (body: FunctionArgs<typeof functions.calendars.createCalendar>['body']) =>
    request(() => convex.mutation(functions.calendars.createCalendar, { body })),
  save: (id: string, body: Infer<typeof saveInputV4>) =>
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
};
