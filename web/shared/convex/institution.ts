import type { FunctionArgs } from 'convex/server';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

export const institution = {
  createCampus: (name: string) =>
    request(() => convex.mutation(functions.campuses.createCampus, { name })),
  saveCatalogue: (body: FunctionArgs<typeof functions.catalogue.saveCatalogue>['body']) =>
    request(() => convex.mutation(functions.catalogue.saveCatalogue, { body })),
  catalogueImpact: (body: FunctionArgs<typeof functions.catalogue.catalogueImpact>['body']) =>
    request(() => convex.query(functions.catalogue.catalogueImpact, { body })),
};
