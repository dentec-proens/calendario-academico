import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

// One-off: deletes the Chromium archives of the retired server PDF runtime.
// Only gzip files whose size and SHA-256 match the former
// DENTEC_CHROMIUM_RUNTIME manifest are removed. Remove this module once it
// has run in every deployment.
export const deleteChromiumArchives = internalMutation({
  args: {
    archives: v.array(
      v.object({ storageId: v.id('_storage'), size: v.number(), sha256: v.string() }),
    ),
  },
  returns: v.object({ deleted: v.number(), missing: v.number() }),
  handler: async (ctx, { archives }) => {
    let deleted = 0,
      missing = 0;
    for (const archive of archives) {
      const metadata = await ctx.db.system.get('_storage', archive.storageId);
      if (!metadata) {
        missing++;
        continue;
      }
      const sha256 = btoa(
        String.fromCharCode(
          ...(archive.sha256.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)),
        ),
      );
      if (
        metadata.contentType !== 'application/gzip' ||
        metadata.size !== archive.size ||
        metadata.sha256 !== sha256
      )
        throw Error(`O arquivo ${archive.storageId} não corresponde ao manifesto do runtime.`);
      await ctx.storage.delete(archive.storageId);
      deleted++;
    }
    return { deleted, missing };
  },
});
