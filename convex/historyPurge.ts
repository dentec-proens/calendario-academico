import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/**
 * Level 2 operation: deletes the per-save history, which nothing writes since the lifecycle
 * release. Called only manually, one batch per call, after the rehearsal on a restored backup and
 * the owner's explicit authorization. Removed with the tables in the contraction.
 */
export const purgeCalendarHistory = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({
    versions: v.number(),
    snapshots: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, { batchSize = 100 }) => {
    const size = Math.max(1, Math.min(500, Math.floor(batchSize)));
    // Versions reference snapshots, so they go first.
    const versions = await ctx.db.query('calendarVersions').take(size);
    for (const row of versions) await ctx.db.delete('calendarVersions', row._id);
    const snapshots =
      versions.length < size
        ? await ctx.db.query('calendarSnapshots').take(size - versions.length)
        : [];
    for (const row of snapshots) await ctx.db.delete('calendarSnapshots', row._id);
    const remaining =
      (await ctx.db.query('calendarVersions').first()) ??
      (await ctx.db.query('calendarSnapshots').first());
    const result = { versions: versions.length, snapshots: snapshots.length, done: !remaining };
    console.log('purgeCalendarHistory', JSON.stringify(result));
    return result;
  },
});
