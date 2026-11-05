import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Doc } from '../../convex/_generated/dataModel';
import { createNativeFixture } from '../helpers/native-database.ts';
import { civilDate } from '../../src/domain/civil-date.ts';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

async function withStoredTarget() {
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
    const period = {
      id: 'p',
      name: 'Ano letivo',
      start: civilDate('2027-02-01'),
      end: civilDate('2027-12-10'),
      targetDays: 200,
      association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
    };
    await ctx.db.patch(content._id, { state: { ...content.state, periods: [period] } });
    return content._id;
  });
  return { fixture, stored };
}

const read = (
  fixture: Awaited<ReturnType<typeof createNativeFixture>>,
  id: Doc<'calendarContents'>['_id'],
) => fixture.client.run((ctx) => ctx.db.get(id));

test('the migration removes the retired value, keeps the end and writes nothing else', async () => {
  const { fixture, stored } = await withStoredTarget();
  const before = (await read(fixture, stored))!;
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await fixture.client.query(internal.migrations.status, {})).toMatchObject([
    { name: 'migrations:refuseTargetDaysInSubmissions', state: 'success', error: null },
    { name: 'migrations:dropPeriodTargetDays', state: 'success', error: null },
  ]);
  const after = (await read(fixture, stored))!;
  expect(after.state.periods[0]).toEqual({
    id: 'p',
    name: 'Ano letivo',
    start: '2027-02-01',
    end: '2027-12-10',
    association: { status: 'defined', offers: ['integrado'], term: 'annual' },
  });
  const { state: _beforeState, ...beforeRest } = before;
  const { state: _afterState, ...afterRest } = after;
  expect(afterRest).toEqual(beforeRest);
});

test('a content that left editing is not rewritten, because a submission fixed it by hash', async () => {
  const { fixture, stored } = await withStoredTarget();
  const before = (await read(fixture, stored))!;
  await fixture.client.run(async (ctx) => {
    await ctx.db.patch(before.calendarId, { status: 'enviado' });
  });
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  const status = await fixture.client.query(internal.migrations.status, {});
  expect(status[1]).toMatchObject({ name: 'migrations:dropPeriodTargetDays', state: 'failed' });
  expect(await read(fixture, stored)).toEqual(before);
});
