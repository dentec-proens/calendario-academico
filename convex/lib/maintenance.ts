import { ConvexError } from 'convex/values';
import { internal } from '../_generated/api';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';

export async function maintenanceAccess(ctx: QueryCtx | MutationCtx, candidate?: Id<'users'>) {
  if (process.env.DENTEC_MAINTENANCE === '1') return false;
  const id = candidate ?? (await getAuthUserId(ctx));
  if (!id) return false;
  const control = await ctx.db
    .query('operationalControl')
    .withIndex('by_key', (q) => q.eq('key', 'release'))
    .unique();
  if (!control?.paused || control.smokeUserId !== id) return false;
  const user = await ctx.db.get(id);
  return (
    !!user &&
    user.role === 'ADMIN' &&
    user.active &&
    user.loginMethod === 'local' &&
    user.removedAt === undefined
  );
}

export async function maintenancePaused(ctx: QueryCtx | MutationCtx) {
  const control = await ctx.db
    .query('operationalControl')
    .withIndex('by_key', (q) => q.eq('key', 'release'))
    .unique();
  return control?.paused === true || process.env.DENTEC_MAINTENANCE === '1';
}

export async function assertWritesOpen(ctx: QueryCtx | MutationCtx, candidate?: Id<'users'>) {
  if ((await maintenancePaused(ctx)) && !(await maintenanceAccess(ctx, candidate)))
    throw new ConvexError({
      status: 503,
      error: 'Aplicação em manutenção. Aguarde a conclusão e recarregue a página.',
    });
}

export async function withActionLease<T>(
  ctx: ActionCtx,
  operation: string,
  work: () => Promise<T>,
): Promise<T> {
  const lease: Id<'operationalLeases'> = await ctx.runMutation(internal.operations.begin, {
    operation,
  });
  console.info('Operational lease', lease, operation);
  try {
    return await work();
  } finally {
    // A failed cleanup keeps the lease visible and blocks publication. Elapsed
    // time alone never proves that a remote action has stopped executing.
    await ctx.runMutation(internal.operations.finish, { id: lease });
  }
}
