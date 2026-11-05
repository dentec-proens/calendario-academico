import { expect, test } from 'vitest';

test('a configuração real de cron carrega e exporta as limpezas', async () => {
  const { default: crons } = await import('../../convex/crons');
  const registered: unknown = JSON.parse(JSON.stringify(crons.crons));

  expect(registered).toEqual({
    'expired-auth-cleanup': {
      name: 'access/cleanup:sweep',
      args: [{}],
      schedule: { type: 'interval', minutes: 15 },
    },
    'client-errors-cleanup': {
      name: 'clientErrors:sweep',
      args: [{}],
      schedule: { type: 'daily', hourUTC: 6, minuteUTC: 0 },
    },
  });
});
