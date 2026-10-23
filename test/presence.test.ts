import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import presenceTest from '@convex-dev/presence/test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api.js';

async function fixture() {
  const client = convexTest(schema, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/presence.ts': () => import('../convex/presence'),
  });
  presenceTest.register(client);
  const ids = await client.run(async (ctx) => {
    const campusId = await ctx.db.insert('campuses', { name: 'Campus A', archived: false });
    const admin = await ctx.db.insert('users', {
      name: 'Admin',
      email: 'admin@ifpr.edu.br',
      role: 'ADMIN',
      active: true,
      loginMethod: 'local',
    });
    const campus = await ctx.db.insert('users', {
      name: 'Campus',
      email: 'campus@ifpr.edu.br',
      role: 'CAMPUS',
      campusId,
      active: true,
      loginMethod: 'local',
    });
    const adminSession = await ctx.db.insert('authSessions', {
      userId: admin,
      expirationTime: Date.now() + 3600000,
    });
    const campusSession = await ctx.db.insert('authSessions', {
      userId: campus,
      expirationTime: Date.now() + 3600000,
    });
    return { admin, campus, adminSession, campusSession };
  });
  return {
    client,
    ids,
    admin: client.withIdentity({ subject: `${ids.admin}|${ids.adminSession}` }),
    campus: client.withIdentity({ subject: `${ids.campus}|${ids.campusSession}` }),
  };
}
const tab1 = '11111111-1111-4111-8111-111111111111';
const tab2 = '22222222-2222-4222-8222-222222222222';

test('presence requires a valid account and restricts identities to ADMIN', async () => {
  const { client, campus, admin, ids } = await fixture();
  await assert.rejects(
    client.mutation(api.presence.heartbeat, { tabId: tab1 }),
    /Entre com sua conta/,
  );
  await assert.rejects(client.query(api.presence.online, {}), /Entre com sua conta/);
  await assert.rejects(campus.query(api.presence.online, {}), /exclusivo/);
  const result = await campus.mutation(api.presence.heartbeat, { tabId: tab1 });
  assert.deepEqual(Object.keys(result), ['sessionToken']);
  const online = await admin.query(api.presence.online, {});
  assert.equal(online.users[0].id, ids.campus);
  assert.equal(online.users[0].campusName, 'Campus A');
  await client.run((ctx) => ctx.db.patch(ids.campus, { active: false }));
  assert.deepEqual((await admin.query(api.presence.online, {})).users, []);
  await assert.rejects(
    campus.mutation(api.presence.heartbeat, { tabId: tab1 }),
    /Entre com sua conta/,
  );
});

test('multiple portal/editor tabs and devices count once and disconnect independently', async () => {
  const { client, campus, admin, ids } = await fixture();
  const session = await client.run((ctx) =>
    ctx.db.insert('authSessions', { userId: ids.campus, expirationTime: Date.now() + 3600000 }),
  );
  const otherDevice = client.withIdentity({ subject: `${ids.campus}|${session}` });
  const first = await campus.mutation(api.presence.heartbeat, { tabId: tab1 });
  const second = await campus.mutation(api.presence.heartbeat, { tabId: tab2 });
  const third = await otherDevice.mutation(api.presence.heartbeat, { tabId: tab1 });
  assert.equal((await admin.query(api.presence.online, {})).users.length, 1);
  await client.mutation(api.presence.disconnect, first);
  await client.mutation(api.presence.disconnect, second);
  assert.equal((await admin.query(api.presence.online, {})).users.length, 1);
  await client.mutation(api.presence.disconnect, third);
  assert.equal((await admin.query(api.presence.online, {})).users.length, 0);
});

test('missed heartbeats expire without any further client request', async () => {
  vi.useFakeTimers();
  try {
    const { client, campus, admin } = await fixture();
    await campus.mutation(api.presence.heartbeat, { tabId: tab1 });
    assert.equal((await admin.query(api.presence.online, {})).users.length, 1);
    vi.advanceTimersByTime(89_000);
    await client.finishInProgressScheduledFunctions();
    assert.equal((await admin.query(api.presence.online, {})).users.length, 1);
    vi.advanceTimersByTime(2_000);
    await client.finishAllScheduledFunctions(vi.runAllTimers);
    assert.equal((await admin.query(api.presence.online, {})).users.length, 0);
  } finally {
    vi.useRealTimers();
  }
});

test('expired or revoked authentication cannot maintain presence', async () => {
  const { client, campus, ids } = await fixture();
  await campus.mutation(api.presence.heartbeat, { tabId: tab1 });
  await client.run((ctx) => ctx.db.delete(ids.campusSession));
  await assert.rejects(
    campus.mutation(api.presence.heartbeat, { tabId: tab1 }),
    /Entre com sua conta/,
  );
});
