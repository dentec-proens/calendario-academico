import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { withoutStageReferences } from '../../src/stage-references';

/** Administrative cleanup: preview counts first, apply only in a drained, owned maintenance. */
export const removePage = internalMutation({
  args: {
    table: v.union(v.literal('calendarContents'), v.literal('calendarSnapshots')),
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    commit: v.optional(v.string()),
    backupSha256: v.optional(v.string()),
  },
  returns: v.object({
    scanned: v.number(),
    changed: v.number(),
    removed: v.number(),
    done: v.boolean(),
    cursor: v.string(),
  }),
  handler: async (ctx, args) => {
    if (!args.dryRun) {
      const control = await ctx.db
        .query('operationalControl')
        .withIndex('by_key', (q) => q.eq('key', 'release'))
        .unique();
      if (
        !args.commit ||
        !/^[a-f0-9]{40}$/.test(args.commit) ||
        !control?.paused ||
        control.commit !== args.commit ||
        control.smokeUserId
      )
        throw Error(
          'A limpeza exige manutenção exclusiva do commit informado, sem acesso de smoke.',
        );
      if (!args.backupSha256 || !/^[a-f0-9]{64}$/.test(args.backupSha256))
        throw Error('Informe o SHA-256 do backup integral conferido antes da limpeza.');
      if ((await ctx.db.query('operationalLeases').withIndex('by_startedAt').take(1)).length)
        throw Error('Aguarde a drenagem das operações antes da limpeza.');
    }
    // A bounded full scan is intentional: both current content and every historical snapshot.
    const page = await ctx.db
      .query(args.table)
      .paginate({ cursor: args.cursor, numItems: 10, maximumBytesRead: 2_000_000 });
    let changed = 0,
      removed = 0;
    for (const row of page.page) {
      const result = withoutStageReferences(row.state);
      if (!result.removed) continue;
      changed++;
      removed += result.removed;
      if (!args.dryRun) await ctx.db.patch(row._id, { state: result.state });
    }
    if (!args.dryRun && changed)
      await ctx.db.insert('audit', {
        at: Date.now(),
        action: 'assessment-stage-references-removed',
        target: { type: 'archived', reference: 'stage-reference-cleanup' },
        details: JSON.stringify({
          table: args.table,
          commit: args.commit,
          backupSha256: args.backupSha256,
          changed,
          removed,
          cursor: args.cursor,
          nextCursor: page.continueCursor,
        }),
      });
    return {
      scanned: page.page.length,
      changed,
      removed,
      done: page.isDone,
      cursor: page.continueCursor,
    };
  },
});
