import { calendarRecordDates } from '../../web/shared/convex/calendar-dates.ts';
import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, readyContent, saveReview } from '../helpers/lifecycle.ts';

const paginationOpts = { numItems: 10, cursor: null };

async function fixture() {
  const f = await createNativeFixture();
  const member = (name: string, email: string) =>
    f.client.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        name,
        email,
        role: 'PARECERISTA',
        active: true,
        loginMethod: 'local',
      });
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 3_600_000,
      });
      return { userId, identity: { subject: `${userId}|${sessionId}` } };
    });
  const ana = await member('Ana', 'ana@ifpr.edu.br');
  const bruno = await member('Bruno', 'bruno@ifpr.edu.br');
  const campus = f.asClient('campus-a');
  const drafted = async () => {
    const { id } = await campus
      .mutation(api.calendars.createCalendar, {
        body: {
          campusId: f.ids.campuses.a,
          year: 2027,
          offers: [{ kind: 'integrado', organization: 'anual' }],
        },
      })
      .then(calendarRecordDates);
    await f.client.run(async (ctx) => {
      await ctx.db.patch(id, { courses: 'Curso sintético' });
      const content = await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
        .unique();
      await ctx.db.patch(content!._id, { state: readyContent() as never });
    });
    return id;
  };
  const submitted = async () => {
    const id = await drafted();
    await act(campus, id, 'submit');
    return id;
  };
  return {
    ...f,
    campus,
    ana: f.client.withIdentity(ana.identity),
    anaId: ana.userId,
    bruno: f.client.withIdentity(bruno.identity),
    brunoId: bruno.userId,
    drafted,
    submitted,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const holder = async (client: Fixture['ana'], id: Id<'calendars'>) =>
  (await client.query(api.reviews.review, { id })).assignee?.name ?? null;
const audit = (f: Fixture, id: Id<'calendars'>) =>
  f.client.run(async (ctx) =>
    (await ctx.db.query('audit').collect())
      .filter((row) => row.calendarId === id && row.action.endsWith('_REVIEW'))
      .map((row) => [row.action, row.details ?? null]),
  );

test('opening a parecer takes nothing; assuming it leaves the status for the first save', async () => {
  const f = await fixture();
  const id = await f.submitted();
  expect(await holder(f.ana, id)).toBeNull();
  await f.ana.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: null });
  const review = await f.ana.query(api.reviews.review, { id });
  expect(review.assignee?.name).toBe('Ana');
  // Assuming is not starting the review: the campus may still withdraw the submission.
  expect(review.status).toBe('enviado');
  await act(f.campus, id, 'withdraw');
});

test('only the holder saves, and a parecer without one belongs to whoever saves it', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await saveReview(f.ana, id);
  expect(await holder(f.bruno, id)).toBe('Ana');
  expect(await audit(f, id)).toContainEqual(['ASSUME_REVIEW', null]);
  await expect(saveReview(f.bruno, id)).rejects.toThrow(/Ana assumiu este parecer/);
  await saveReview(f.ana, id);
  await f.ana.mutation(api.reviews.releaseReview, { id });
  await saveReview(f.bruno, id);
  expect(await holder(f.ana, id)).toBe('Bruno');
});

test('a parecer is taken only from the holder the person saw, and the change is recorded', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await f.ana.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: null });
  await expect(
    f.bruno.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: null }),
  ).rejects.toThrow(/Ana assumiu este parecer/);
  await f.bruno.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: f.anaId });
  expect(await holder(f.ana, id)).toBe('Bruno');
  await expect(saveReview(f.ana, id)).rejects.toThrow(/Bruno assumiu este parecer/);
  expect(await audit(f, id)).toEqual([
    ['ASSUME_REVIEW', null],
    ['ASSUME_REVIEW', 'Ana'],
  ]);
  await f.bruno.mutation(api.reviews.releaseReview, { id });
  await expect(
    f.ana.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: f.brunoId }),
  ).rejects.toThrow(/foi liberado/);
});

test('only the holder releases a parecer', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await f.ana.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: null });
  await expect(f.bruno.mutation(api.reviews.releaseReview, { id })).rejects.toThrow(
    /Só essa pessoa/,
  );
  await f.ana.mutation(api.reviews.releaseReview, { id });
  expect(await holder(f.ana, id)).toBeNull();
  expect(await audit(f, id)).toContainEqual(['RELEASE_REVIEW', null]);
});

test('the campus neither assumes nor releases a parecer', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await expect(
    f.campus.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: null }),
  ).rejects.toThrow(/pareceristas/);
  await expect(f.campus.mutation(api.reviews.releaseReview, { id })).rejects.toThrow(
    /pareceristas/,
  );
});

test('the holder lasts through a return and resubmission, and shows only while the parecer is open', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await saveReview(f.ana, id);
  await act(f.ana, id, 'return', { note: 'Ajustar datas.' });
  expect(await holder(f.ana, id)).toBeNull();
  await expect(
    f.bruno.mutation(api.reviews.assumeReview, { id, expectedAssigneeId: f.anaId }),
  ).rejects.toThrow(/enviado ou em revisão/);
  await act(f.campus, id, 'submit');
  expect(await holder(f.bruno, id)).toBe('Ana');
});

test('a late release after a return keeps the holder for the resubmission', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await saveReview(f.ana, id);
  await act(f.bruno, id, 'return', { note: 'Ajustar datas.' });
  await expect(f.ana.mutation(api.reviews.releaseReview, { id })).rejects.toThrow(
    /enviado ou em revisão/,
  );
  await act(f.campus, id, 'submit');
  expect(await holder(f.bruno, id)).toBe('Ana');
});

test('concluding does not depend on being the holder', async () => {
  const f = await fixture();
  const id = await f.submitted();
  await saveReview(f.ana, id);
  await act(f.bruno, id, 'conclude');
  await act(f.bruno, id, 'reopen');
  expect((await f.bruno.query(api.reviews.review, { id })).status).toBe('em_revisao');
});

test('the holder filter continues across pages', async () => {
  const f = await fixture();
  const [first, second] = [await f.drafted(), await f.drafted()];
  await f.client.run(async (ctx) => {
    for (const id of [first, second]) await ctx.db.patch(id, { status: 'enviado' });
  });
  const page = await f.ana.query(api.reviews.reviewQueue, {
    holder: 'none',
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(page.page.map((item) => item.id)).toEqual([second]);
  const next = await f.ana.query(api.reviews.reviewQueue, {
    holder: 'none',
    paginationOpts: { numItems: 1, cursor: page.continueCursor },
  });
  expect(next.page.map((item) => item.id)).toEqual([first]);
});

test('the queue filters by holder, alone and within a campus', async () => {
  const f = await fixture();
  const [mine, theirs, free] = [await f.drafted(), await f.drafted(), await f.drafted()];
  // The submission rules refuse overlapping calendars; this test is only about listing them.
  await f.client.run(async (ctx) => {
    for (const id of [mine, theirs, free]) await ctx.db.patch(id, { status: 'enviado' });
  });
  await f.ana.mutation(api.reviews.assumeReview, { id: mine, expectedAssigneeId: null });
  await f.bruno.mutation(api.reviews.assumeReview, { id: theirs, expectedAssigneeId: null });
  const ids = async (holderFilter?: 'mine' | 'none', campusId?: Id<'campuses'>) =>
    (
      await f.ana.query(api.reviews.reviewQueue, {
        paginationOpts,
        ...(holderFilter ? { holder: holderFilter } : {}),
        ...(campusId ? { campusId } : {}),
      })
    ).page.map((item) => item.id);
  expect(await ids()).toEqual([free, theirs, mine]);
  expect(await ids('mine')).toEqual([mine]);
  expect(await ids('none')).toEqual([free]);
  expect(await ids('mine', f.ids.campuses.a)).toEqual([mine]);
  expect(await ids('none', f.ids.campuses.b)).toEqual([]);
  const { page } = await f.ana.query(api.reviews.reviewQueue, { paginationOpts });
  expect(page.map((item) => item.assignee?.name ?? null)).toEqual([null, 'Bruno', 'Ana']);
});
