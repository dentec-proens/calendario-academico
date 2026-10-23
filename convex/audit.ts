import type { QueryCtx } from './_generated/server';
import type { Member } from './authContracts';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

const pageSize = 100;
const maximumOffset = 8_000;

// Keep the existing offset UI while bounding backend reads. Calendar/history
// references are resolved only for the requested page, never whole tables.
export async function readAuditPage(
  ctx: QueryCtx,
  role: Member['role'],
  campusId: string | null,
  offset: number,
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumOffset)
    throw Error('Página fora do limite permitido. Exporte a auditoria em lotes.');
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
  const calendars = new Map<
    string,
    { id: string; campusId?: string; state: { year?: number; campus?: string } } | null
  >();
  const histories = new Map<string, { id: string; calendarId: string } | null>();
  const users = new Map<string, { id: string; name?: string; campusId?: string } | null>();

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
}
