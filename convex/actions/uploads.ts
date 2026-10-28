import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';

// Preserve the published name so old tabs fail explicitly without adopting or
// deleting a Storage object supplied by the browser.
export const completeUpload = action({
  args: { uploadId: v.string(), storageId: v.id('_storage') },
  returns: v.object({ uploadId: v.string() }),
  handler: async (ctx, args): Promise<{ uploadId: string }> =>
    ctx.runMutation(internal.nativeFiles.finishUpload, { ...args, hash: '', size: 0 }),
});
