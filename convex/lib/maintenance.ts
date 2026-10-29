import { ConvexError } from 'convex/values';
import { internal } from '../_generated/api';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export async function maintenancePaused(ctx: QueryCtx | MutationCtx) {
  const control = await ctx.db
    .query('operationalControl')
    .withIndex('by_key', (q) => q.eq('key', 'release'))
    .unique();
  return control?.paused === true || process.env.DENTEC_MAINTENANCE === '1';
}

export async function assertWritesOpen(ctx: QueryCtx | MutationCtx) {
  if (await maintenancePaused(ctx))
    throw new ConvexError({
      status: 503,
      error: 'Aplicação em manutenção. Aguarde a conclusão e recarregue a página.',
    });
}

export async function withActionLease<T>(
  ctx: ActionCtx,
  operation: string,
  work: () => Promise<T>,
  admittedLease?: Id<'operationalLeases'>,
): Promise<T> {
  const lease: Id<'operationalLeases'> =
    admittedLease ?? (await ctx.runMutation(internal.operations.begin, { operation }));
  console.info('Operational lease', lease, operation);
  try {
    return await work();
  } finally {
    // A failed cleanup keeps the lease visible and blocks publication. Elapsed
    // time alone never proves that a remote action has stopped executing.
    await ctx.runMutation(internal.operations.finish, { id: lease });
  }
}
