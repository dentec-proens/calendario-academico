import { expect, test } from 'vitest';
import { assertScheduledFunctions, inspectScheduledFunctions } from '../scripts/release-scheduled';
import { releaseSmokeConfiguration } from '../scripts/release-smoke-config';

test('release checks every pending scheduled identity and rejects in-progress or incomplete inventories', () => {
  expect(() =>
    assertScheduledFunctions([{ name: 'nativeFiles.js:expireTicket', state: { kind: 'pending' } }]),
  ).not.toThrow();
  expect(() =>
    assertScheduledFunctions([{ name: 'removed:work', state: { kind: 'success' } }]),
  ).not.toThrow();
  expect(() =>
    assertScheduledFunctions([{ name: 'removed:work', state: { kind: 'pending' } }]),
  ).toThrow('identidade preservada');
  expect(() =>
    assertScheduledFunctions([{ name: 'nativeFiles:expireUpload', state: { kind: 'inProgress' } }]),
  ).toThrow('em execução');
  expect(() => assertScheduledFunctions([{ name: 'nativeFiles:expireUpload' }])).toThrow(
    'inválido',
  );
});

test('release inventories more than a thousand scheduled rows and detects a bad final page', () => {
  let pages = 0;
  expect(() =>
    inspectScheduledFunctions((cursor) => {
      const offset = Number(cursor ?? '0');
      pages++;
      return JSON.stringify({
        page: Array.from({ length: 100 }, () => ({
          name: 'nativeFiles:expireUpload',
          state: { kind: 'pending' },
        })),
        isDone: offset >= 1000,
        continueCursor: String(offset + 100),
      });
    }, true),
  ).not.toThrow();
  expect(pages).toBe(11);
  expect(() =>
    inspectScheduledFunctions(
      (cursor) =>
        JSON.stringify({
          page: [
            {
              name: cursor ? 'removed:handler' : 'nativeFiles:expireTicket',
              state: { kind: 'pending' },
            },
          ],
          isDone: !!cursor,
          continueCursor: 'next',
        }),
      true,
    ),
  ).toThrow('identidade preservada');
  expect(() =>
    inspectScheduledFunctions(
      () => JSON.stringify({ page: [], isDone: false, continueCursor: 'same' }),
      true,
    ),
  ).toThrow('não avançou');
});

test('release smoke requires a dedicated identity and calendar without changing configured public targets', () => {
  expect(() => releaseSmokeConfiguration({})).toThrow('conta operacional');
  const value = releaseSmokeConfiguration({
    DENTEC_RELEASE_SMOKE_USER_ID: 'account',
    DENTEC_RELEASE_SMOKE_EMAIL: 'account@ifpr.edu.br',
    DENTEC_RELEASE_SMOKE_PASSWORD: 'private',
    DENTEC_RELEASE_SMOKE_CALENDAR_ID: 'calendar',
  });
  expect(value.backendUrl).toBe('https://exuberant-cheetah-138.convex.cloud');
  expect(value.portalUrl).toBe('https://calendario-academico-phi.vercel.app');
});
