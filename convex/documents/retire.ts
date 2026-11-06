import { internalMutation } from '../_generated/server';
import { assertWritesOpen } from '../lib/maintenance';
import { fail } from '../lib/shared';
import { v } from 'convex/values';

/**
 * Temporary administrative executor: removes the last institutional document and its stored PDF.
 * The hash must match, so it cannot reach another record. Calendars and submissions keep their
 * own copies of the metadata, which never read this row. Leaves the code once applied.
 */
export const retireDocument = internalMutation({
  args: { id: v.id('documents'), hash: v.string() },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, { id, hash }) => {
    await assertWritesOpen(ctx);
    const row = await ctx.db.get(id);
    if (!row) return { deleted: false };
    if (row.hash !== hash) fail('O SHA-256 não corresponde ao documento informado.', 409);
    if (row.storageId && (await ctx.db.system.get(row.storageId)))
      await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    await ctx.db.insert('audit', {
      at: Date.now(),
      actorLabel: 'Operação administrativa',
      action: 'DELETE_INSTITUTIONAL_DOCUMENT',
      target: { type: 'document', id },
      details: `${row.title} · SHA-256 ${row.hash}`,
    });
    return { deleted: true };
  },
});
