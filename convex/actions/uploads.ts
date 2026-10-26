'use node';
import { withActionLease } from '../lib/maintenance';
import { internal } from '../_generated/api';
import { action } from '../_generated/server';
import { fail, validate } from './files';
import { v } from 'convex/values';
import { createHash } from 'node:crypto';

export const completeUpload = action({
  args: { uploadId: v.string(), storageId: v.id('_storage') },
  returns: v.object({ uploadId: v.string() }),
  handler: async (ctx, { uploadId, storageId }): Promise<{ uploadId: string }> =>
    withActionLease(ctx, 'actions.uploads.completeUpload', async () => {
      const upload = await ctx.runQuery(internal.nativeFiles.uploadContext, { uploadId });
      const blob = await ctx.storage.get(storageId);
      if (!blob) fail('Arquivo não encontrado.', 404);
      if (blob.size < 5 || blob.size > 8_000_000) fail('Envie um PDF de até 8 MB.');
      const bytes = validate(Buffer.from(await blob.arrayBuffer()));
      if (bytes.length !== upload.size) fail('O tamanho do PDF recebido é diferente do informado.');
      return ctx.runMutation(internal.nativeFiles.finishUpload, {
        uploadId,
        storageId,
        size: bytes.length,
        hash: createHash('sha256').update(bytes).digest('hex'),
      });
    }),
});
