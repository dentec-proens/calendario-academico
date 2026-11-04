import { expect, test } from 'vitest';
import { calendarRecordDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarEvent } from '../../src/domain/calendar/model.ts';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, readyContent } from '../helpers/lifecycle.ts';

/**
 * Internal dates (art. 18) at the Convex boundary: `saveCalendar` keeps the eligibility of the
 * domain, submissions keep the whole content with `internal`, and the review lists an internal date
 * apart.
 */
const rehearsal: CalendarEvent = {
  id: 'campus-rehearsal',
  name: 'Ensaio da Semana Cultural',
  start: civilDate('2027-10-05'),
  end: civilDate('2027-10-05'),
  effect: 'note',
  category: 'evento',
  offers: ['integrado'],
  internal: true,
};

async function fixture() {
  const f = await createNativeFixture();
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
    return { subject: `${userId}|${sessionId}` };
  });
  const campus = f.asClient('campus-a');
  const created = await campus
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: f.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado' as const, organization: 'anual' as const }],
      },
    })
    .then(calendarRecordDates);
  const id = created.id;
  const contentId = await f.client.run(async (ctx) => {
    await ctx.db.patch(id, { courses: 'Curso sintético' });
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique();
    await ctx.db.patch(content!._id, { state: readyContent() as never });
    return content!._id;
  });
  const load = () => campus.query(api.calendars.calendar, { id }).then(calendarRecordDates);
  type State = Awaited<ReturnType<typeof load>>['state'];
  const save = async (change: (events: State['events']) => State['events']) => {
    const record = await load();
    return campus.mutation(api.calendars.saveCalendar, {
      id,
      body: {
        version: record.version,
        catalogueRevision: record.catalogueRevision,
        state: JSON.parse(
          JSON.stringify({ ...record.state, events: change(record.state.events) }),
        ) as State,
      },
    });
  };
  const submissions = () =>
    f.client.run((ctx) =>
      ctx.db
        .query('calendarSubmissions')
        .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', id))
        .collect(),
    );
  return {
    ...f,
    id,
    contentId,
    campus,
    reviewer: f.client.withIdentity(reviewerIdentity),
    load,
    save,
    submissions,
  };
}

test('saveCalendar keeps an eligible internal date and refuses an ineligible one', async () => {
  const f = await fixture();
  await f.save((events) => [...events, rehearsal]);
  const saved = (await f.load()).state.events.find((event) => event.id === rehearsal.id);
  expect(saved).toMatchObject({ internal: true, category: 'evento' });
  const before = await f.load();
  const mark = (change: Partial<CalendarEvent>) => (events: CalendarEvent[]) =>
    events.map((event) => (event.id === rehearsal.id ? { ...event, ...change } : event));
  await expect(f.save(mark({ effect: 'exclude' }))).rejects.toThrow(/sem efeito na contagem/);
  await expect(f.save(mark({ category: 'recesso' }))).rejects.toThrow(/Só datas comemorativas/);
  const linked = before.state.events.find((event) => event.activity)!;
  await expect(
    f.save((events) =>
      events.map((event) => (event.id === linked.id ? { ...event, internal: true } : event)),
    ),
  ).rejects.toThrow(/vinculada a atividade/);
  await expect(f.save(mark({ internal: false as unknown as true }))).rejects.toThrow(
    /Expected `true`, got `false`/,
  );
  expect((await f.load()).version).toBe(before.version);
  // A date of the institutional base never carries the mark: its stored validator has no field.
  await expect(
    f.client.run(async (ctx) => {
      const content = (await ctx.db.get(f.contentId))!;
      await ctx.db.patch(f.contentId, {
        institutionalSnapshot: [
          ...content.institutionalSnapshot,
          {
            id: 'inst:semana',
            name: 'Semana institucional',
            start: '2027-05-04',
            end: '2027-05-04',
            effect: 'note',
            evidence: 'Base',
            offers: ['integrado'],
            internal: true,
          } as never,
        ],
      });
    }),
  ).rejects.toThrow(/internal/);
});

test('a submission keeps `internal` and unmarking changes the content hash', async () => {
  const f = await fixture();
  await f.save((events) => [...events, rehearsal]);
  await act(f.campus, f.id, 'submit');
  const [first] = await f.submissions();
  expect(first.state.events.find((event) => event.id === rehearsal.id)).toMatchObject({
    internal: true,
  });
  expect(first.contentHash).toBe(contentHash(first));

  await act(f.campus, f.id, 'withdraw');
  await f.save((events) =>
    events.map((event) => {
      if (event.id !== rehearsal.id) return event;
      const { internal: _internal, ...official } = event;
      return official;
    }),
  );
  await act(f.campus, f.id, 'submit');
  const [, second] = await f.submissions();
  const official = second.state.events.find((event) => event.id === rehearsal.id)!;
  expect(official).not.toHaveProperty('internal');
  const { internal: _internal, ...withoutMark } = first.state.events.find(
    (event) => event.id === rehearsal.id,
  )!;
  expect(official).toEqual(withoutMark);
  expect(second.contentHash).not.toBe(first.contentHash);
});

test('the review lists an internal date apart, never as a candidate of the criterion', async () => {
  const f = await fixture();
  await f.save((events) => [
    ...events.filter((event) => !/cultural|interescolar/i.test(event.name)),
    rehearsal,
  ]);
  await act(f.campus, f.id, 'submit');
  const support = await f.reviewer.query(api.reviews.review, { id: f.id as Id<'calendars'> });
  const criterion = support.criteria.find((item) => item.id === 'XXVI')!;
  expect(
    criterion.candidates.filter((item) => !item.internal).map((item) => item.id),
  ).not.toContain(rehearsal.id);
  expect(criterion.candidates.find((item) => item.id === rehearsal.id)).toMatchObject({
    internal: true,
    name: rehearsal.name,
  });
});
