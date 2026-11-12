import { convexModules } from '../helpers/convex-modules.ts';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { convexTest } from 'convex-test';
import type { FunctionReturnType } from 'convex/server';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

async function fixture() {
  const client = convexTest(schema, convexModules);
  const ids = {} as { calendarA: Id<'calendars'>; calendarB: Id<'calendars'> };
  const identities = await client.run(async (ctx) => {
    const campusA = await ctx.db.insert('campuses', { name: 'Campus A', archived: false });
    const campusB = await ctx.db.insert('campuses', { name: 'Campus B', archived: false });
    const adminId = await ctx.db.insert('users', {
      name: 'Admin atual',
      email: 'audit-admin@ifpr.edu.br',
      role: 'ADMIN',
      active: true,
      loginMethod: 'local',
    });
    const memberId = await ctx.db.insert('users', {
      name: 'Membro atual',
      email: 'audit-campus@ifpr.edu.br',
      role: 'CAMPUS',
      campusId: campusA,
      active: true,
      loginMethod: 'local',
    });
    const fields = {
      year: 2027,
      offerKinds: ['integrado' as const],
      status: 'rascunho' as const,
      statusRevision: 0,
      statusAt: 1,
      courses: 'Teste',
      classes: '',
      shifts: '',
      version: 3,
      updatedAt: 1,
    };
    const calendarA = await ctx.db.insert('calendars', { ...fields, campusId: campusA });
    const calendarB = await ctx.db.insert('calendars', { ...fields, campusId: campusB });
    await ctx.db.insert('audit', {
      at: 1,
      actorId: memberId,
      action: 'CREATE_CALENDAR',
      target: { type: 'calendar', id: calendarA },
      campusId: campusA,
      calendarId: calendarA,
    });
    await ctx.db.insert('audit', {
      at: 2,
      actorId: memberId,
      action: 'ANALYZE_HISTORY',
      target: { type: 'archived', reference: 'previous-calendar:removed' },
      campusId: campusA,
      calendarId: calendarA,
    });
    await ctx.db.insert('audit', {
      at: 3,
      actorId: adminId,
      action: 'REMOVE_MEMBER',
      target: { type: 'user', id: memberId },
      campusId: campusA,
    });
    // A denormalized scope alone never grants access to another campus's log.
    await ctx.db.insert('audit', {
      at: 4,
      actorId: adminId,
      action: 'CREATE_CALENDAR',
      target: { type: 'calendar', id: calendarB },
      campusId: campusA,
      calendarId: calendarB,
    });
    await ctx.db.insert('audit', {
      at: 5,
      actorId: adminId,
      actorLabel: 'Nome original preservado',
      action: 'SAVE_HUMAN_REVIEW',
      target: { type: 'calendar', id: calendarA },
      campusId: campusA,
      calendarId: calendarA,
      version: 3,
    });
    await ctx.db.insert('audit', {
      at: 6,
      actorLabel: 'Importação anterior',
      action: 'ORIGINAL_UNKNOWN_ACTION',
      target: { type: 'archived', reference: 'unresolved-source' },
    });
    const result = [];
    ids.calendarA = calendarA;
    ids.calendarB = calendarB;
    for (const userId of [adminId, memberId]) {
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 3600000,
      });
      result.push({ subject: `${userId}|${sessionId}` });
    }
    return result;
  });
  return {
    admin: client.withIdentity(identities[0]),
    campus: client.withIdentity(identities[1]),
    anonymous: client,
    ...ids,
  };
}

test('native audit cursor pages expose only calendar and archived operations of the authorized campus', async () => {
  const { campus } = await fixture();
  const entries = [];
  let cursor: string | null = null;
  let pages = 0;
  for (;;) {
    const result: FunctionReturnType<typeof api.workspace.logs> = await campus.query(
      api.workspace.logs,
      {
        paginationOpts: { numItems: 2, cursor },
      },
    );
    entries.push(...result.entries);
    pages++;
    if (result.isDone) break;
    assert.notEqual(result.continueCursor, cursor);
    cursor = result.continueCursor;
  }
  assert.equal(pages, 3);
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ['Parecer salvo', 'Calendário anterior analisado', 'Calendário criado'],
  );
  assert.equal(entries[0].actor, 'Nome original preservado');
  assert.equal(entries[0].version, 3);
  assert.equal(entries[1].actor, 'Membro atual');
  assert(entries.every((entry) => entry.calendar?.includes('Campus A')));
  assert.equal(entries[2].at, new Date(1).toISOString());
});

test('native admin audit preserves imported actor labels and unresolved targets', async () => {
  const { admin } = await fixture();
  const result = await admin.query(api.workspace.logs, {
    paginationOpts: { numItems: 20, cursor: null },
  });
  assert.equal(result.entries.length, 6);
  assert.equal(result.isDone, true);
  assert.deepEqual(result.entries[0], {
    at: new Date(6).toISOString(),
    actor: 'Importação anterior',
    action: 'Alteração administrativa registrada',
    calendar: null,
    version: null,
  });
  assert(
    result.entries.some((entry) => entry.action === 'Acesso removido' && entry.calendar === null),
  );
  assert(result.entries.some((entry) => entry.calendar?.includes('Campus B')));
});

test('calendar history lists only that calendar, newest first, across cursor pages', async () => {
  const { campus, calendarA } = await fixture();
  const entries = [];
  let cursor: string | null = null;
  for (;;) {
    const result: FunctionReturnType<typeof api.calendars.history> = await campus.query(
      api.calendars.history,
      { id: calendarA, paginationOpts: { numItems: 2, cursor } },
    );
    entries.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ['Parecer salvo', 'Calendário anterior analisado', 'Calendário criado'],
  );
  assert(entries.every((entry) => entry.calendar?.includes('Campus A')));
});

test('calendar history follows the calendar read authorization', async () => {
  const { admin, campus, anonymous, calendarA, calendarB } = await fixture();
  const paginationOpts = { numItems: 10, cursor: null };
  await assert.rejects(campus.query(api.calendars.history, { id: calendarB, paginationOpts }));
  await assert.rejects(anonymous.query(api.calendars.history, { id: calendarA, paginationOpts }));
  const other = await admin.query(api.calendars.history, { id: calendarB, paginationOpts });
  assert.deepEqual(
    other.page.map((entry) => entry.action),
    ['Calendário criado'],
  );
  await admin.run((ctx) => ctx.db.patch(calendarA, { deletedAt: 10 }));
  await assert.rejects(admin.query(api.calendars.history, { id: calendarA, paginationOpts }));
});
