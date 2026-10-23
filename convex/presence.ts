import { Presence } from '@convex-dev/presence';
import { getAuthSessionId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { components } from './_generated/api';
import { mutation, query } from './_generated/server';
import { memberFromRow, requireNativeUser } from './nativeAuth';

const presence = new Presence<'application', string>(components.presence);
const room = 'application';
const limit = 1000;

export const heartbeat = mutation({
  args: { tabId: v.string() },
  returns: v.object({ sessionToken: v.string() }),
  handler: async (ctx, { tabId }) => {
    const { user } = await requireNativeUser(ctx);
    if (!/^[a-f0-9-]{36}$/.test(tabId)) throw new ConvexError('Identificador de aba inválido.');
    const sessionId = await getAuthSessionId(ctx);
    const { sessionToken } = await presence.heartbeat(
      ctx,
      room,
      user.id,
      `${sessionId}:${tabId}`,
      36_000,
    );
    // The room token is deliberately private: only ADMIN may list users.
    return { sessionToken };
  },
});

// An opaque capability permits unloading tabs to disconnect via sendBeacon,
// including after sign-out, without exposing identities or room access.
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => presence.disconnect(ctx, sessionToken),
});

export const online = query({
  args: {},
  returns: v.object({
    truncated: v.boolean(),
    users: v.array(
      v.object({
        id: v.id('users'),
        name: v.string(),
        email: v.string(),
        role: v.union(v.literal('ADMIN'), v.literal('CAMPUS'), v.literal('PARECERISTA')),
        campusId: v.union(v.id('campuses'), v.null()),
        campusName: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { user } = await requireNativeUser(ctx);
    if (user.role !== 'ADMIN')
      throw new ConvexError({ status: 403, error: 'Acesso exclusivo da administração.' });
    const entries = await presence.listRoom(ctx, room, true, limit + 1);
    const users = await Promise.all(
      entries.slice(0, limit).map(async (entry) => {
        const id = ctx.db.normalizeId('users', entry.userId);
        const member = id ? memberFromRow(await ctx.db.get(id)) : null;
        if (!member) return null;
        const campus = member.campusId ? await ctx.db.get(member.campusId) : null;
        return {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          campusId: member.campusId,
          campusName: campus?.name ?? 'Institucional',
        };
      }),
    );
    return {
      truncated: entries.length > limit,
      users: users
        .filter((member) => member !== null)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    };
  },
});
