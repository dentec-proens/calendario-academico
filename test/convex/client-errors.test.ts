import { expect, test } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';

const refusal = {
  kind: 'save' as const,
  status: 409,
  message: 'Há versão mais recente. Reabra o calendário.',
  route: '/calendarios/abc?token=segredo#periodos',
  release: 'build-1',
};
const firstPage = { paginationOpts: { cursor: null, numItems: 50 } };

test('a refused save reaches the administration without its query string', async () => {
  const fixture = await createNativeFixture();
  await fixture.asClient('campus-a').mutation(api.clientErrors.report, refusal);
  const { entries } = await fixture.asClient('admin').query(api.clientErrors.list, firstPage);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    kind: 'save',
    status: 409,
    message: refusal.message,
    route: '/calendarios/abc',
    release: 'build-1',
    calendar: null,
  });
});

test('only the administration reads the failures, and only a member reports them', async () => {
  const fixture = await createNativeFixture();
  await expect(
    fixture.asClient('campus-a').query(api.clientErrors.list, firstPage),
  ).rejects.toThrow('administração');
  await expect(fixture.client.mutation(api.clientErrors.report, refusal)).rejects.toThrow(
    'Entre com sua conta',
  );
});

test('a page stuck in a loop stops at the hourly limit', async () => {
  const fixture = await createNativeFixture();
  const account = fixture.asClient('campus-a');
  for (let i = 0; i < 31; i++) await account.mutation(api.clientErrors.report, refusal);
  const { entries } = await fixture.asClient('admin').query(api.clientErrors.list, firstPage);
  expect(entries).toHaveLength(30);
});

test('failures older than ninety days are removed', async () => {
  const fixture = await createNativeFixture();
  const day = 24 * 60 * 60_000;
  await fixture.client.run(async (ctx) => {
    for (const [message, age] of [
      ['antiga', 91],
      ['recente', 89],
    ] as const)
      await ctx.db.insert('clientErrors', {
        at: Date.now() - age * day,
        userId: fixture.ids.users['campus-a']!,
        kind: 'save',
        message,
        route: '/calendarios',
        release: 'build-1',
      });
  });
  await fixture.client.mutation(internal.clientErrors.sweep, {});
  const { entries } = await fixture.asClient('admin').query(api.clientErrors.list, firstPage);
  expect(entries.map(({ message }) => message)).toEqual(['recente']);
});
