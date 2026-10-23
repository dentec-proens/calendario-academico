import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../../convex/schema';
import { applyChanges, readSnapshot } from '../../convex/store';
import { encodeValue, decodeValue } from '../../src/convex-codec.mjs';

export const userFixtures = [
  {
    id: 'admin',
    name: 'Admin',
    email: 'admin@ifpr.edu.br',
    role: 'ADMIN',
    campusId: null,
    active: true,
    salt: 'private-salt',
    hash: 'private-hash',
  },
  {
    id: 'campus-a',
    name: 'Campus A',
    email: 'a@ifpr.edu.br',
    role: 'CAMPUS',
    campusId: 'a',
    active: true,
  },
  {
    id: 'campus-b',
    name: 'Campus B',
    email: 'b@ifpr.edu.br',
    role: 'CAMPUS',
    campusId: 'b',
    active: true,
  },
];

type Entity = Record<string, unknown>;
type Seed = Record<string, unknown>;

// Fixtures execute the real native handlers against a fresh local Convex database.
// They never open a deployment, read credentials or expose an alternate Node API.
export async function createNativeFixture(overrides: Seed = {}) {
  const client = convexTest(schema, {
    '../../convex/_generated/server.js': () => import('../../convex/_generated/server.js'),
    '../../convex/native.ts': () => import('../../convex/native'),
    '../../convex/nativeAuth.ts': () => import('../../convex/nativeAuth'),
    '../../convex/nativeFiles.ts': () => import('../../convex/nativeFiles'),
    '../../convex/nativeActions.ts': () => import('../../convex/nativeActions'),
  });
  const state: Seed = {
    users: structuredClone(userFixtures),
    campuses: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    catalogue: { revision: 1, events: [] },
    calendars: [],
    histories: [],
    reviews: [],
    documents: [],
    audit: [],
    uploads: [],
    ...overrides,
  };
  const changes = Object.entries(state).map(([field, value]) =>
    Array.isArray(value)
      ? {
          field,
          upserts: value.map((entity: Entity, position: number) => {
            const id = entity.id ?? entity.calendarId ?? position;
            if (typeof id !== 'string' && typeof id !== 'number')
              throw new Error('Synthetic fixture IDs must be strings or numbers.');
            return { key: `${field}:${id}`, position, value: encodeValue(entity) };
          }),
        }
      : { field, value: encodeValue(value) },
  );
  await client.run((ctx) => applyChanges(ctx, changes, { full: true }));
  const accounts: Record<string, ReturnType<typeof client.withIdentity>> = {};
  for (const user of userFixtures) {
    const identity = await client.run(async (ctx) => {
      const row = await ctx.db
        .query('users')
        .withIndex('by_appId', (q) => q.eq('appId', user.id))
        .unique();
      if (!row) throw new Error('Missing synthetic fixture user.');
      const sessionId = await ctx.db.insert('authSessions', {
        userId: row._id,
        expirationTime: Date.now() + 3_600_000,
      });
      return { subject: `${row._id}|${sessionId}` };
    });
    accounts[user.id] = client.withIdentity(identity);
  }
  const as = (id: string) => {
    const account = accounts[id];
    if (!account) throw new Error('Unknown synthetic fixture user.');
    return {
      read: (path: string) =>
        account.query(makeFunctionReference<'query'>('native:read'), { path }),
      write: (path: string, body: Entity = {}, method = 'POST') =>
        account.mutation(makeFunctionReference<'mutation'>('native:write'), { path, method, body }),
      actionContext: (path: string, body: Entity = {}) =>
        account.query(makeFunctionReference<'query'>('native:actionContext'), { path, body }),
      finishAction: (path: string, body: Entity, result: Entity) =>
        account.mutation(makeFunctionReference<'mutation'>('native:finishAction'), {
          path,
          body,
          result,
        }),
    };
  };
  const inspect = async () =>
    decodeValue((await client.run((ctx) => readSnapshot(ctx, { full: true }))).state);
  const asClient = (id: string) => {
    const account = accounts[id];
    if (!account) throw new Error('Unknown synthetic fixture user.');
    return account;
  };
  return { client, as, asClient, inspect };
}
