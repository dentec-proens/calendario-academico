import { convexModules } from './helpers/convex-modules.ts';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { convexTest } from 'convex-test';
import type { FunctionReturnType } from 'convex/server';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

async function fixture() {
  const client = convexTest(schema, convexModules);
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
      modalities: ['integrado' as const],
      purpose: 'test' as const,
      courses: 'Teste',
      classes: '',
      shifts: '',
      version: 3,
      updatedAt: 1,
    };
    const calendarA = await ctx.db.insert('calendars', { ...fields, campusId: campusA });
    const calendarB = await ctx.db.insert('calendars', { ...fields, campusId: campusB });
    const history = await ctx.db.insert('histories', {
      calendarId: calendarA,
      campusId: campusA,
      year: 2026,
      modalities: ['integrado'],
      filename: 'original.pdf',
      hash: 'a'.repeat(64),
      notes: '',
      createdAt: 1,
      unavailableFile: { sourceReference: 'original/original.pdf', reason: 'not_migrated' },
    });
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
      target: { type: 'history', id: history },
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
    for (const userId of [adminId, memberId]) {
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 3600000,
      });
      result.push({ subject: `${userId}|${sessionId}` });
    }
    return result;
  });
  return { admin: client.withIdentity(identities[0]), campus: client.withIdentity(identities[1]) };
}

test('native audit cursor pages expose only calendar and history operations of the authorized campus', async () => {
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
