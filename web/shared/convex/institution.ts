import type { FunctionArgs } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

export const institution = {
  openDocument: (id: string) =>
    request(() => convex.mutation(functions.documents.openDocument, { id: id as Id<'documents'> })),
  createCampus: (name: string) =>
    request(() => convex.mutation(functions.campuses.createCampus, { name })),
  saveCatalogue: (body: FunctionArgs<typeof functions.catalogue.saveCatalogue>['body']) =>
    request(() => convex.mutation(functions.catalogue.saveCatalogue, { body })),
  uploadDocument: (file: FunctionArgs<typeof functions.actions.documents.uploadDocument>) =>
    request(() => convex.action(functions.actions.documents.uploadDocument, file)),
  restoreDocumentOriginal: (id: string, uploadId: string) =>
    request(() =>
      convex.action(functions.actions.documents.restoreDocumentOriginal, {
        id: id as Id<'documents'>,
        uploadId,
      }),
    ),
  documentStatus: (
    id: string,
    options: Omit<FunctionArgs<typeof functions.documents.documentStatus>, 'id'>,
  ) =>
    request(() =>
      convex.mutation(functions.documents.documentStatus, {
        id: id as Id<'documents'>,
        ...options,
      }),
    ),
};
