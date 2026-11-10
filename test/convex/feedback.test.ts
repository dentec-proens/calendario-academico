import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, readyContent } from '../helpers/lifecycle.ts';

const day = 24 * 60 * 60_000;
const firstPage = { paginationOpts: { cursor: null, numItems: 50 } };
const where = { route: '/calendarios/abc?token=segredo#periodos', release: 'build-1' };

afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const f = await createNativeFixture();
  const campus = f.asClient('campus-a');
  const reviewerIdentity = await f.client.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: 'Parecerista',
      email: 'parecer@ifpr.edu.br',
      role: 'PARECERISTA',
      active: true,
      loginMethod: 'local',
    });
    const sessionId = await ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 3_600_000,
    });
    return { userId, subject: `${userId}|${sessionId}` };
  });
  const create = async (campusKey: 'a' | 'b' = 'a') => {
    const author = campusKey === 'a' ? campus : f.asClient('campus-b');
    const record = await author.mutation(api.calendars.createCalendar, {
      body: {
        campusId: f.ids.campuses[campusKey]!,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    });
    return record.id;
  };
  /** Records in the audit the action the invitation asks about, as the transition would. */
  const acted = (
    userId: Id<'users'>,
    calendarId: Id<'calendars'>,
    action: string,
    at = Date.now(),
  ) =>
    f.client.run((ctx) =>
      ctx.db.insert('audit', {
        at,
        actorId: userId,
        action,
        target: { type: 'calendar', id: calendarId },
        calendarId,
      }),
    );
  const rows = () => f.client.run((ctx) => ctx.db.query('feedback').collect());
  return {
    ...f,
    campus,
    campusId: f.ids.users['campus-a']! as Id<'users'>,
    reviewer: f.client.withIdentity({ subject: reviewerIdentity.subject }),
    reviewerId: reviewerIdentity.userId,
    admin: f.asClient('admin'),
    create,
    acted,
    rows,
  };
}

test('submitting a calendar opens one invitation, recorded as shown and without the query string', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.client.run(async (ctx) => {
    await ctx.db.patch(id, { courses: 'Curso sintético' });
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique();
    await ctx.db.patch(content!._id, { state: readyContent() as never });
  });
  await act(f.campus, id, 'submit');
  const invitation = await f.campus.mutation(api.feedback.openFeedbackPrompt, {
    context: 'submit',
    calendarId: id,
    ...where,
  });
  expect(invitation).not.toBeNull();
  expect(await f.rows()).toMatchObject([
    {
      context: 'submit',
      outcome: 'shown',
      role: 'CAMPUS',
      route: '/calendarios/abc',
      calendarId: id,
    },
  ]);
  await expect(
    f.campus.mutation(api.feedback.openFeedbackPrompt, {
      context: 'submit',
      calendarId: id,
      ...where,
    }),
    'a second invitation for the same calendar and context',
  ).resolves.toBeNull();
});

test('no invitation without the action recorded by the same person, recently', async () => {
  const f = await fixture();
  const id = await f.create();
  const open = (client = f.campus, context: 'submit' | 'review' = 'submit') =>
    client.mutation(api.feedback.openFeedbackPrompt, { context, calendarId: id, ...where });
  await expect(open()).resolves.toBeNull();
  await f.acted(f.campusId, id, 'SUBMIT_CALENDAR', Date.now() - 11 * 60_000);
  await expect(open(), 'an action too old').resolves.toBeNull();
  await f.acted(f.reviewerId, id, 'SUBMIT_CALENDAR');
  await expect(open(), 'an action by someone else').resolves.toBeNull();
  await f.acted(f.campusId, id, 'SUBMIT_CALENDAR');
  await expect(open(f.campus, 'review'), 'a context the person did not live').resolves.toBeNull();
  await expect(open()).resolves.not.toBeNull();
});

test('a reviewer is invited after returning, and the administration is invited too', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.acted(f.reviewerId, id, 'RETURN_CALENDAR');
  await expect(
    f.reviewer.mutation(api.feedback.openFeedbackPrompt, {
      context: 'review',
      calendarId: id,
      ...where,
    }),
  ).resolves.not.toBeNull();
  const adminId = f.ids.users.admin! as Id<'users'>;
  await f.acted(adminId, id, 'CONCLUDE_REVIEW');
  await expect(
    f.admin.mutation(api.feedback.openFeedbackPrompt, {
      context: 'review',
      calendarId: id,
      ...where,
    }),
  ).resolves.not.toBeNull();
  expect((await f.rows()).map((row) => row.role).sort()).toEqual(['ADMIN', 'PARECERISTA']);
});

test('a calendar of another campus is refused', async () => {
  const f = await fixture();
  const other = await f.create('b');
  await f.acted(f.campusId, other, 'SUBMIT_CALENDAR');
  await expect(
    f.campus.mutation(api.feedback.openFeedbackPrompt, {
      context: 'submit',
      calendarId: other,
      ...where,
    }),
  ).rejects.toThrow('Registro não encontrado');
});

test('any feedback within the interval, even ignored or spontaneous, holds the next invitation', async () => {
  const f = await fixture();
  const [first, second] = [await f.create(), await f.create()];
  await f.acted(f.campusId, first, 'SUBMIT_CALENDAR');
  await f.acted(f.campusId, second, 'SUBMIT_CALENDAR');
  const open = (calendarId: Id<'calendars'>) =>
    f.campus.mutation(api.feedback.openFeedbackPrompt, { context: 'submit', calendarId, ...where });
  // The first invitation is only shown: ignoring it counts.
  await expect(open(first)).resolves.not.toBeNull();
  await expect(open(second)).resolves.toBeNull();
  // Fifteen days later, a spontaneous suggestion still holds it.
  await f.client.run(async (ctx) => {
    for (const row of await ctx.db.query('feedback').collect())
      await ctx.db.patch(row._id, { at: row.at - 15 * day });
  });
  await f.campus.mutation(api.feedback.sendFeedback, { comment: 'Gostei.', ...where });
  await expect(open(second)).resolves.toBeNull();
  await f.client.run(async (ctx) => {
    for (const row of await ctx.db.query('feedback').collect())
      await ctx.db.patch(row._id, { at: row.at - 15 * day });
  });
  await expect(open(second)).resolves.not.toBeNull();
});

test('during maintenance nothing is recorded and nothing fails', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.acted(f.campusId, id, 'SUBMIT_CALENDAR');
  vi.stubEnv('DENTEC_MAINTENANCE', '1');
  await expect(
    f.campus.mutation(api.feedback.openFeedbackPrompt, {
      context: 'submit',
      calendarId: id,
      ...where,
    }),
  ).resolves.toBeNull();
  await expect(
    f.campus.mutation(api.feedback.sendFeedback, { rating: 4, ...where }),
  ).resolves.toBeNull();
  expect(await f.rows()).toEqual([]);
});

test('the author rates, changes the rating and comments within the window; nobody else does', async () => {
  const f = await fixture();
  const calendarId = await f.create();
  await f.acted(f.campusId, calendarId, 'SUBMIT_CALENDAR');
  const id = (await f.campus.mutation(api.feedback.openFeedbackPrompt, {
    context: 'submit',
    calendarId,
    ...where,
  }))!;
  for (const rating of [0, 6, 2.5])
    await expect(f.campus.mutation(api.feedback.rateFeedback, { id, rating })).rejects.toThrow(
      'cinco opções',
    );
  await f.campus.mutation(api.feedback.rateFeedback, { id, rating: 2 });
  await f.campus.mutation(api.feedback.rateFeedback, { id, rating: 4 });
  await f.campus.mutation(api.feedback.commentFeedback, { id, comment: '  Faltou um atalho.  ' });
  await expect(
    f.campus.mutation(api.feedback.commentFeedback, { id, comment: '   ' }),
  ).rejects.toThrow('Escreva');
  await expect(
    f.asClient('campus-b').mutation(api.feedback.rateFeedback, { id, rating: 1 }),
  ).rejects.toThrow('Registro não encontrado');
  // Closing after rating keeps the answer.
  await f.campus.mutation(api.feedback.dismissFeedback, { id });
  expect(await f.rows()).toMatchObject([
    { outcome: 'answered', rating: 4, comment: 'Faltou um atalho.' },
  ]);
  await f.client.run((ctx) => ctx.db.patch(id, { at: Date.now() - 31 * 60_000 }));
  await expect(
    f.campus.mutation(api.feedback.commentFeedback, { id, comment: 'Mais tarde.' }),
  ).rejects.toThrow('prazo');
});

test('closing an unanswered invitation records the refusal', async () => {
  const f = await fixture();
  const calendarId = await f.create();
  await f.acted(f.campusId, calendarId, 'SUBMIT_CALENDAR');
  const id = (await f.campus.mutation(api.feedback.openFeedbackPrompt, {
    context: 'submit',
    calendarId,
    ...where,
  }))!;
  await f.campus.mutation(api.feedback.dismissFeedback, { id });
  expect(await f.rows()).toMatchObject([{ outcome: 'dismissed' }]);
});

test('a suggestion needs a rating or a comment, and stops at the hourly limit', async () => {
  const f = await fixture();
  await expect(f.campus.mutation(api.feedback.sendFeedback, where)).rejects.toThrow(
    'Escolha uma opção ou escreva',
  );
  await expect(
    f.campus.mutation(api.feedback.sendFeedback, { comment: 'x'.repeat(2001), ...where }),
  ).rejects.toThrow('até 2000');
  for (let i = 0; i < 11; i++)
    await f.campus.mutation(api.feedback.sendFeedback, { rating: 5, ...where });
  const rows = await f.rows();
  expect(rows).toHaveLength(10);
  expect(rows[0]).toMatchObject({
    context: 'spontaneous',
    outcome: 'answered',
    route: '/calendarios/abc',
  });
});

test('only the administration reads the answered feedback', async () => {
  const f = await fixture();
  const calendarId = await f.create();
  await f.acted(f.campusId, calendarId, 'SUBMIT_CALENDAR');
  await f.campus.mutation(api.feedback.openFeedbackPrompt, {
    context: 'submit',
    calendarId,
    ...where,
  });
  await f.campus.mutation(api.feedback.sendFeedback, { comment: 'Sugestão.', ...where });
  await expect(f.campus.query(api.feedback.listFeedback, firstPage)).rejects.toThrow(
    'administração',
  );
  const { entries } = await f.admin.query(api.feedback.listFeedback, firstPage);
  expect(entries).toMatchObject([
    {
      context: 'spontaneous',
      comment: 'Sugestão.',
      rating: null,
      actor: 'Campus A',
      role: 'CAMPUS',
    },
  ]);
});

test('feedback older than a year is removed', async () => {
  const f = await fixture();
  await f.client.run(async (ctx) => {
    for (const [comment, age] of [
      ['antigo', 366],
      ['recente', 364],
    ] as const)
      await ctx.db.insert('feedback', {
        at: Date.now() - age * day,
        userId: f.campusId,
        role: 'CAMPUS',
        context: 'spontaneous',
        outcome: 'answered',
        comment,
        route: '/',
        release: 'build-1',
      });
  });
  await f.client.mutation(internal.feedback.sweep, {});
  expect((await f.rows()).map((row) => row.comment)).toEqual(['recente']);
});
