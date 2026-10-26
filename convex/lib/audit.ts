import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from '../authContracts';
import type { auditTarget } from '../validators';
import type { Infer } from 'convex/values';

export async function appendAudit(
  ctx: MutationCtx,
  user: Member,
  action: string,
  target: Infer<typeof auditTarget>,
  scope: { campusId?: Id<'campuses'>; calendarId?: Id<'calendars'>; version?: number } = {},
) {
  await ctx.db.insert('audit', { at: Date.now(), actorId: user.id, action, target, ...scope });
}
