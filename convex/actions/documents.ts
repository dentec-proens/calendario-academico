'use node';
import { withActionLease } from '../lib/maintenance';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { action } from '../_generated/server';
import { documentUploadInput, fileDownload, documentMetadata } from '../validators';
import { downloadOriginal } from './files';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';

export const uploadDocument = action({
  args: documentUploadInput.fields,
  returns: documentMetadata,
  handler: async (ctx, args): Promise<Infer<typeof documentMetadata>> =>
    withActionLease(ctx, 'actions.documents.uploadDocument', async () =>
      ctx.runMutation(internal.documents.attachDocument, args),
    ),
});

export const downloadDocument = action({
  args: { id: v.id('documents') },
  returns: fileDownload,
  handler: async (ctx, args): Promise<Infer<typeof fileDownload>> =>
    withActionLease(ctx, 'actions.documents.downloadDocument', async () => {
      const { document } = await ctx.runQuery(internal.documents.documentContext, args);
      return downloadOriginal(ctx, document);
    }),
});

export const restoreDocumentOriginal = action({
  args: { id: v.id('documents'), uploadId: v.string() },
  returns: v.object({ id: v.id('documents'), restored: v.literal(true) }),
  handler: async (ctx, args): Promise<{ id: Id<'documents'>; restored: true }> =>
    withActionLease(ctx, 'actions.documents.restoreDocumentOriginal', async () =>
      ctx.runMutation(internal.nativeFiles.restoreDocumentOriginal, args),
    ),
});
