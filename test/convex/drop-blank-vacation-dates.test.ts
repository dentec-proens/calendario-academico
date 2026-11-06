import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Doc } from '../../convex/_generated/dataModel';
import { createNativeFixture } from '../helpers/native-database.ts';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

const dated = {
  firstStart: '2027-01-04',
  firstEnd: '2027-02-02',
  secondStart: '2027-07-12',
  secondEnd: '2027-07-26',
};

async function withBlankThirdPeriod() {
  const fixture = await createNativeFixture();
  await fixture.asClient('admin').mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a!,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
  const stored = await fixture.client.run(async (ctx) => {
    const content = (await ctx.db.query('calendarContents').first()) as Doc<'calendarContents'>;
    await ctx.db.patch(content._id, {
      state: {
        ...content.state,
        rulesetVersion: 'consup-292-2027-v1',
        teacherVacations: { ...dated, thirdStart: '', thirdEnd: '' },
      },
    });
    return content;
  });
  return { fixture, stored };
}

async function migrate(fixture: Awaited<ReturnType<typeof createNativeFixture>>) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await fixture.client.query(internal.migrations.status, {})).toMatchObject([
    { name: 'migrations:dropBlankVacationDates', state: 'success', error: null },
  ]);
}

test('the migration drops blank vacation dates and keeps the rest, with no new version', async () => {
  const { fixture, stored } = await withBlankThirdPeriod();
  const read = () =>
    fixture.client.run(async (ctx) => ({
      content: (await ctx.db.get(stored._id))!,
      calendar: (await ctx.db.get(stored.calendarId))!,
    }));
  const before = await read();
  await migrate(fixture);
  const after = await read();
  expect(after.content.state).toEqual({
    ...before.content.state,
    teacherVacations: dated,
  });
  // The campus still hears about the rule changes after the version it last saw.
  expect(after.content.state.rulesetVersion).toBe('consup-292-2027-v1');
  expect(after.calendar).toEqual(before.calendar);
});

test('a content that left editing is not rewritten, because a submission fixed it by hash', async () => {
  const { fixture, stored } = await withBlankThirdPeriod();
  await fixture.client.run(async (ctx) => {
    await ctx.db.patch(stored.calendarId, { status: 'enviado' });
  });
  const read = () => fixture.client.run((ctx) => ctx.db.get(stored._id));
  const before = await read();
  await migrate(fixture);
  expect(await read()).toEqual(before);
});
