import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { archive } from '../../convex/calendars/record';
import schema from '../../convex/schema';
import { initializePresencialAndPurgeTrash } from '../../convex/migrations';

const fixture = () =>
  convexTest(schema, {
    '../../convex/_generated/server.js': () => import('../../convex/_generated/server.js'),
  });
async function seed(t: ReturnType<typeof fixture>, trash = false) {
  return t.run(async (ctx) => {
    const campusId = await ctx.db.insert('campuses', { name: 'Campus', archived: false });
    const id = await ctx.db.insert('calendars', {
      campusId,
      year: 2027,
      offerKinds: ['integrado'],
      purpose: 'definitive',
      courses: '',
      classes: '',
      shifts: '',
      version: 2,
      updatedAt: 100,
      ...(trash ? { deletedAt: 200 } : {}),
    });
    const contentId = await ctx.db.insert('calendarContents', {
      calendarId: id,
      state: {
        schemaVersion: 4,
        offers: [
          { id: 'a', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' },
          { id: 'b', kind: 'integrado', delivery: 'ead', organization: 'anual', label: 'EaD' },
        ],
        weekdays: [],
        weekConfirmed: false,
        periods: [],
        events: [],
      },
      catalogueRevision: 0,
      institutionalSnapshot: [],
      documentSnapshot: [],
    });
    return { id, contentId, campusId };
  });
}
test('fills only undecided delivery, archives previous state and is idempotent', async () => {
  const t = fixture(),
    { id, contentId } = await seed(t);
  await t.run(async (ctx) => {
    const row = (await ctx.db.get(id))!;
    await initializePresencialAndPurgeTrash(ctx, { ...row, _creationTime: 0 });
    const saved = (await ctx.db.get(contentId))!;
    expect(saved.state.offers.map((o) => o.delivery)).toEqual(['presencial', 'ead']);
    expect((await ctx.db.get(id))!.version).toBe(3);
    const snapshots = await ctx.db.query('calendarSnapshots').take(10);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].state.offers[0].delivery).toBe('a-conferir');
    await initializePresencialAndPurgeTrash(ctx, { ...(await ctx.db.get(id))!, _creationTime: 0 });
    expect((await ctx.db.get(id))!.version).toBe(3);
    expect(await ctx.db.query('audit').take(10)).toHaveLength(1);
  });
});
test('purges trash content and calendar, keeps campus and audit', async () => {
  const t = fixture(),
    { id, contentId, campusId } = await seed(t, true);
  await t.run(async (ctx) => {
    await initializePresencialAndPurgeTrash(ctx, { ...(await ctx.db.get(id))!, _creationTime: 0 });
    expect(await ctx.db.get(id)).toBeNull();
    expect(await ctx.db.get(contentId)).toBeNull();
    expect(await ctx.db.get(campusId)).not.toBeNull();
    expect((await ctx.db.query('audit').take(10))[0].action).toBe('PURGE_CALENDAR_TRASH');
  });
});
test('refuses unexpected trash history and skips trash added after authorization', async () => {
  const t = fixture(),
    { id, contentId } = await seed(t, true);
  await t.run(async (ctx) => {
    const row = (await ctx.db.get(id))!;
    await initializePresencialAndPurgeTrash(ctx, {
      ...row,
      _creationTime: 0,
      deletedAt: Number.MAX_SAFE_INTEGER,
    });
    expect(await ctx.db.get(contentId)).not.toBeNull();
    await archive(ctx, row, (await ctx.db.get(contentId))!);
    await expect(
      initializePresencialAndPurgeTrash(ctx, { ...row, _creationTime: 0 }),
    ).rejects.toThrow('histórico');
    expect(await ctx.db.get(id)).not.toBeNull();
    expect(await ctx.db.get(contentId)).not.toBeNull();
  });
});
