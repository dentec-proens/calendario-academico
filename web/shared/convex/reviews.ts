import type { FunctionArgs } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

export const reviews = {
  get: (id: string) =>
    request(() => convex.query(functions.reviews.review, { id: id as Id<'calendars'> })),
  save: (id: string, body: FunctionArgs<typeof functions.reviews.saveReview>['body']) =>
    request(() =>
      convex.mutation(functions.reviews.saveReview, { id: id as Id<'calendars'>, body }),
    ),
  export: (id: string, revision: number) =>
    request(() =>
      convex.query(functions.reviews.exportReview, { id: id as Id<'calendars'>, revision }),
    ),
};
