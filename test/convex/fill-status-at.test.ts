import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import { statusEntryTime } from '../../convex/migrations.ts';
import { createNativeFixture } from '../helpers/native-database.ts';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

const row = (
  status: Doc<'calendars'>['status'],
  dates: { published?: number; archived?: number } = {},
) => ({
  status,
  _creationTime: 100,
  publishedAt: dates.published,
  archivedAt: dates.archived,
});

test('the latest audit of an action leading to the status is the entry', () => {
  expect(
    statusEntryTime(row('em_revisao'), { audited: [300, undefined, 500], submittedAt: 200 }),
  ).toBe(500);
  // A reinstated calendar entered `vigente` after its publication.
  expect(
    statusEntryTime(row('vigente', { published: 200 }), { audited: [400], submittedAt: 150 }),
  ).toBe(400);
});

test('without an audit, the dates the row keeps stand in', () => {
  const none = { audited: [undefined], submittedAt: 200 };
  expect(statusEntryTime(row('arquivado', { published: 300, archived: 400 }), none)).toBe(400);
  expect(statusEntryTime(row('vigente', { published: 300 }), none)).toBe(300);
  expect(statusEntryTime(row('enviado'), none)).toBe(200);
  expect(statusEntryTime(row('devolvido'), none)).toBe(200);
  // A draft keeps no submission of its own; a withdrawn one may still point to none.
  expect(statusEntryTime(row('rascunho'), none)).toBe(100);
  expect(statusEntryTime(row('revisado'), { audited: [], submittedAt: undefined })).toBe(100);
});

test('the migration fills each calendar from its audit and keeps a time already written', async () => {
  const fixture = await createNativeFixture();
  const created = await fixture.asClient('campus-a').mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a!,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
  const ids = await fixture.client.run(async (ctx) => {
    const {
      _id,
      _creationTime,
      statusAt: _time,
      ...fields
    } = (await ctx.db.get(created.id as Id<'calendars'>))!;
    const audit = (calendarId: Id<'calendars'>, action: string, at: number) =>
      ctx.db.insert('audit', {
        at,
        action,
        target: { type: 'calendar', id: calendarId },
        calendarId,
        campusId: fields.campusId,
      });
    // Sent, returned, sent again: the second submission is the entry, not the first.
    const resent = await ctx.db.insert('calendars', { ...fields, status: 'enviado' });
    await audit(resent, 'SUBMIT_CALENDAR', 1_000);
    await audit(resent, 'RETURN_CALENDAR', 2_000);
    await audit(resent, 'SUBMIT_CALENDAR', 3_000);
    await audit(resent, 'SAVE_CALENDAR', 4_000);
    // Reopened after a conclusion: the reopening is the entry.
    const reopened = await ctx.db.insert('calendars', { ...fields, status: 'em_revisao' });
    await audit(reopened, 'START_REVIEW', 1_500);
    await audit(reopened, 'CONCLUDE_REVIEW', 2_500);
    await audit(reopened, 'REOPEN_REVIEW', 3_500);
    // No audit at all: the archiving date stands in.
    const archived = await ctx.db.insert('calendars', {
      ...fields,
      status: 'arquivado',
      publishedAt: 5_000,
      archivedAt: 6_000,
    });
    const filled = await ctx.db.insert('calendars', {
      ...fields,
      status: 'enviado',
      statusAt: 7_000,
    });
    await audit(filled, 'SUBMIT_CALENDAR', 1_000);
    return { resent, reopened, archived, filled };
  });
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  const statuses = await fixture.client.query(internal.migrations.status, {});
  expect(statuses.find(({ name }) => name === 'migrations:fillStatusAt')).toMatchObject({
    state: 'success',
    error: null,
  });
  const times = await fixture.client.run(async (ctx) =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(ids).map(async ([key, id]) => [key, (await ctx.db.get(id))!.statusAt]),
      ),
    ),
  );
  expect(times).toEqual({ resent: 3_000, reopened: 3_500, archived: 6_000, filled: 7_000 });
});
