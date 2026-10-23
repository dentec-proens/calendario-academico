import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireBridge } from './bridge';
import { encodedValue } from './schema';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

const pageSize = 100;
const maximumOffset = 8_000;

// Keep the existing offset UI while bounding backend reads. Calendar/history
// references are resolved only for the requested page, never whole tables.
export const page = query({
  args: {
    secret: v.string(),
    role: v.union(v.literal('ADMIN'), v.literal('CAMPUS')),
    campusId: v.union(v.string(), v.null()),
    offset: v.number(),
  },
  returns: v.object({ state: encodedValue, hasMore: v.boolean() }),
  handler: async (ctx, { secret, role, campusId, offset }) => {
    requireBridge(secret);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumOffset)
      throw Error('Página fora do limite do experimento. Exporte a auditoria em lotes.');
    if (role === 'CAMPUS' && !campusId) throw Error('Campus obrigatório.');
    const collection = ctx.db.query('audit');
    const rows = await (
      role === 'CAMPUS'
        ? collection.withIndex('by_campusId_and_position', (q) => q.eq('campusId', campusId!))
        : collection.withIndex('by_position')
    )
      .order('desc')
      .take(offset + pageSize + 1);
    const entries = rows.slice(offset, offset + pageSize).map((row) => decodeValue(row.value));
    const calendars = new Map<string, any>();
    const histories = new Map<string, any>();
    const users = new Map<string, any>();

    const findHistory = async (id: string) => {
      if (!histories.has(id)) {
        const row = await ctx.db
          .query('histories')
          .withIndex('by_appId', (q) => q.eq('appId', id))
          .unique();
        const item = row ? decodeValue(row.value) : null;
        histories.set(id, item ? { id: item.id, calendarId: item.calendarId } : null);
      }
      return histories.get(id);
    };
    const findCalendar = async (id: string) => {
      if (!calendars.has(id)) {
        const row = await ctx.db
          .query('calendars')
          .withIndex('by_appId', (q) => q.eq('appId', id))
          .unique();
        const item = row ? decodeValue(row.value) : null;
        calendars.set(
          id,
          item
            ? {
                id: item.id,
                campusId: item.campusId,
                state: { year: item.state?.year, campus: item.state?.campus },
              }
            : null,
        );
      }
    };
    const findUser = async (id: string) => {
      if (!users.has(id)) {
        const row = await ctx.db
          .query('users')
          .withIndex('by_appId', (q) => q.eq('appId', id))
          .unique();
        const item = row ? decodeValue(row.value) : null;
        users.set(id, item ? { id: item.id, name: item.name, campusId: item.campusId } : null);
      }
    };
    for (const entry of entries) {
      if (typeof entry.id === 'string') {
        const history = await findHistory(entry.id);
        await findCalendar(history?.calendarId || entry.id);
        await findUser(entry.id);
      }
      if (typeof entry.actor === 'string') await findUser(entry.actor);
    }
    return {
      state: encodeValue({
        audit: entries.reverse(),
        calendars: [...calendars.values()].filter(Boolean),
        histories: [...histories.values()].filter(Boolean),
        users: [...users.values()].filter(Boolean),
      }),
      hasMore: rows.length > offset + pageSize,
    };
  },
});
