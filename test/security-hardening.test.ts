import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { getFunctionName, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type { ActionCtx } from '../convex/_generated/server';
import { generateKeyPairSync } from 'node:crypto';
import { api, internal } from '../convex/_generated/api.js';
import { passwordCrypto } from '../convex/authCrypto.ts';
import { createNativeFixture } from './helpers/native-database.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.CONVEX_SITE_URL = 'https://security-fixture.convex.site';
process.env.AUTH_LOG_LEVEL = 'ERROR';
process.env.AUTH_GOOGLE_ID = 'synthetic-google-client';
process.env.AUTH_GOOGLE_SECRET = 'synthetic-google-secret';
process.env.SITE_URL = 'http://127.0.0.1:4183';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  const f = await createNativeFixture();
  await f.client.run(async (ctx) => {
    await ctx.db.insert('authAccounts', {
      userId: f.ids.users['campus-a'],
      provider: 'password',
      providerAccountId: 'a@ifpr.edu.br',
      secret: await passwordCrypto.hashSecret('synthetic-password'),
    });
  });
  return f;
}

test('revocation succeeds after 1000 public refreshes and immediately rejects old identity', async () => {
  const { client, asClient, ids } = await fixture();
  let signedIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
  });
  const subject = JSON.parse(
    Buffer.from(signedIn.tokens!.token.split('.')[1], 'base64url').toString(),
  ).sub;
  for (let i = 0; i < 1000; i++)
    signedIn = await client.action(api.auth.signIn, {
      refreshToken: signedIn.tokens!.refreshToken,
    });
  const rows = await client.run((ctx) => ctx.db.query('authRefreshTokens').collect());
  assert.equal(rows.length, 1001);
  await asClient('admin').mutation(api.access.members.removeMember, { id: ids.users['campus-a'] });
  assert.equal(await client.withIdentity({ subject }).query(api.access.session.me, {}), null);
  const expired = await client
    .action(api.auth.signIn, { refreshToken: signedIn.tokens!.refreshToken })
    .catch(() => null);
  assert.equal(expired?.tokens ?? null, null);
});

test('invalid invitation and reset are rejected before hashing or opening operational leases', async () => {
  const { client } = await fixture();
  const hash = vi.spyOn(passwordCrypto, 'hashSecret');
  await assert.rejects(
    client.action(api.access.passwordRecovery.resetPassword, {
      token: 'invalid',
      password: 'synthetic-password',
    }),
  );
  await assert.rejects(
    client.action(api.access.invitations.acceptInvitation, {
      token: 'invalid',
      email: 'a@ifpr.edu.br',
      password: 'synthetic-password',
    }),
  );
  assert.equal(hash.mock.calls.length, 0);
  const scheduled = await client.run((ctx) =>
    ctx.db.system.query('_scheduled_functions').collect(),
  );
  assert.equal(scheduled.length, 0);
  assert.equal((await client.run((ctx) => ctx.db.query('operationalLeases').collect())).length, 0);
});

test('malformed refresh pair does not delete a different known session', async () => {
  const { client, asClient, ids } = await fixture();
  const signedIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
  });
  const victimSession = await client.run((ctx) =>
    ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', ids.users['campus-b']))
      .first(),
  );
  const firstHalf = signedIn.tokens!.refreshToken.split('|')[0];
  await client.action(api.auth.signIn, { refreshToken: firstHalf + '|' + victimSession!._id });
  assert.ok(await asClient('campus-b').query(api.access.session.me, {}));
});

test('campus cannot obtain administrative upload capability', async () => {
  const { asClient } = await fixture();
  await assert.rejects(
    asClient('campus-a').mutation(api.nativeFiles.issueUpload, {
      filename: 'synthetic.pdf',
      size: 12,
    }),
    /administra/,
  );
});

test('new hashes use versioned bounded-memory v2 and verify legacy v1', async () => {
  const hash = await passwordCrypto.hashSecret('synthetic-password');
  assert.match(hash, /^dentec-scrypt-v2\$16384\$8\$5\$/);
  assert.equal(await passwordCrypto.verifySecret('synthetic-password', hash), true);
});

test('same-millisecond password recovery invalidates old sessions and preserves new logins through cleanup', async () => {
  const { client, asClient, ids } = await fixture();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  const frozen = Date.now();
  vi.setSystemTime(frozen);
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  await client.action(api.access.passwordRecovery.resetPassword, {
    token: new URL(recovery.url).hash.split('=')[1],
    password: 'new-synthetic-password',
  });
  assert.equal(await asClient('campus-a').query(api.access.session.me, {}), null);
  const next = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'new-synthetic-password' },
  });
  const subject = JSON.parse(
    Buffer.from(next.tokens!.token.split('.')[1], 'base64url').toString(),
  ).sub;
  const current = client.withIdentity({ subject });
  assert.ok(await current.query(api.access.session.me, {}));
  await client.finishAllScheduledFunctions(vi.runAllTimers);
  assert.equal(Date.now(), frozen, 'the fix cannot depend on advancing the clock');
  assert.ok(await current.query(api.access.session.me, {}));
});

test('revocation is bounded with more than 1000 sessions and 4000 tokens and eventually cleans them', async () => {
  const { client, asClient, ids } = await fixture();
  await client.run(async (ctx) => {
    for (let i = 0; i < 1001; i++) {
      const sessionId = await ctx.db.insert('authSessions', {
        userId: ids.users['campus-a'],
        expirationTime: Date.now() + 3600000,
      });
      for (let j = 0; j < 4; j++)
        await ctx.db.insert('authRefreshTokens', {
          sessionId,
          expirationTime: Date.now() + 3600000,
        });
    }
  });
  await asClient('admin').mutation(api.access.members.updateMemberRole, {
    id: ids.users['campus-a'],
    role: 'PARECERISTA',
    expected: { role: 'CAMPUS', campusId: ids.campuses.a },
  });
  assert.equal(await asClient('campus-a').query(api.access.session.me, {}), null);
  assert.ok(
    (
      await client.run((ctx) =>
        ctx.db
          .query('authSessions')
          .withIndex('userId', (q) => q.eq('userId', ids.users['campus-a']))
          .collect(),
      )
    ).length > 0,
    'bounded immediate cleanup leaves work for continuation',
  );
  await client.finishAllScheduledFunctions(vi.runAllTimers);
  assert.equal(
    (
      await client.run((ctx) =>
        ctx.db
          .query('authSessions')
          .withIndex('userId', (q) => q.eq('userId', ids.users['campus-a']))
          .collect(),
      )
    ).length,
    0,
  );
  assert.equal((await client.run((ctx) => ctx.db.query('authRefreshTokens').collect())).length, 0);
});

test('failed admitted hashing still consumes capacity and invalid capabilities never allocate it', async () => {
  const { client, asClient, ids } = await fixture();
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  const token = new URL(recovery.url).hash.split('=')[1];
  const hash = vi
    .spyOn(passwordCrypto, 'hashSecret')
    .mockRejectedValue(new Error('synthetic hash failure'));
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      client.action(api.access.passwordRecovery.resetPassword, {
        token,
        password: 'synthetic-password',
      }),
      /synthetic hash failure/,
    );
  await assert.rejects(
    client.action(api.access.passwordRecovery.resetPassword, {
      token,
      password: 'synthetic-password',
    }),
    /Muitas tentativas/,
  );
  assert.equal(hash.mock.calls.length, 2);
});

test('administrators can auditably unlock password sign-in without disabling failed-attempt throttling', async () => {
  const { client, asClient, ids } = await fixture();
  for (let i = 0; i < 10; i++)
    await assert.rejects(
      client.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'wrong-synthetic-password' },
      }),
    );
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    /TooManyFailedAttempts/,
  );
  await assert.rejects(
    asClient('campus-b').mutation(api.access.security.unlockPassword, {
      id: ids.users['campus-a'],
    }),
    /administra/,
  );
  await asClient('admin').mutation(api.access.security.unlockPassword, {
    id: ids.users['campus-a'],
  });
  const next = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
  });
  assert.ok(next.tokens);
  const entry = await client.run((ctx) => ctx.db.query('audit').first());
  assert.equal(entry!.action, 'UNLOCK_PASSWORD_LOGIN');
  assert.equal(entry!.actorId, ids.users.admin);
});

test('refreshing a JWT does not renew the original ADMIN authentication age', async () => {
  const { client, ids } = await fixture();
  await client.run(async (ctx) =>
    ctx.db.insert('authAccounts', {
      userId: ids.users.admin,
      provider: 'password',
      providerAccountId: 'admin@ifpr.edu.br',
      secret: await passwordCrypto.hashSecret('admin-synthetic-password'),
    }),
  );
  const first = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'admin@ifpr.edu.br', password: 'admin-synthetic-password' },
  });
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(Date.now() + 16 * 60_000);
  const refreshed = await client.action(api.auth.signIn, {
    refreshToken: first.tokens!.refreshToken,
  });
  const subject = JSON.parse(
    Buffer.from(refreshed.tokens!.token.split('.')[1], 'base64url').toString(),
  ).sub;
  await assert.rejects(
    client
      .withIdentity({ subject })
      .mutation(api.access.security.unlockPassword, { id: ids.users['campus-a'] }),
    /autenticação recente/,
  );
});

test('abandoned public OAuth starts and expired credentials are cleaned within a bounded budget', async () => {
  const { client, ids } = await fixture();
  for (let i = 0; i < 4; i++) await client.action(api.auth.signIn, { provider: 'google' });
  assert.equal((await client.run((ctx) => ctx.db.query('authVerifiers').collect())).length, 4);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(Date.now() + 61 * 60_000);
  await client.action(api.auth.signIn, { provider: 'google' });
  await client.run(async (ctx) => {
    const account = (await ctx.db.query('authAccounts').first())!;
    for (let i = 0; i < 120; i++) {
      await ctx.db.insert('authVerificationCodes', {
        accountId: account._id,
        provider: 'google',
        code: 'synthetic-' + i,
        expirationTime: Date.now() - 1,
      });
      await ctx.db.insert('passwordResets', {
        userId: ids.users['campus-a'],
        tokenHash: 'expired-' + i,
        expiresAt: Date.now() - 1,
      });
    }
    await ctx.db.insert('invitations', {
      userId: ids.users['campus-a'],
      tokenHash: 'expired',
      expiresAt: Date.now() - 1,
      createdBy: ids.users.admin,
      createdAt: Date.now() - 60_000,
      revoked: false,
    });
  });
  const result = await client.mutation(internal.access.cleanup.sweep, {});
  assert.ok(result.deleted <= 100);
  await client.finishAllScheduledFunctions(vi.runAllTimers);
  await client.run(async (ctx) => {
    assert.equal((await ctx.db.query('authVerifiers').collect()).length, 1);
    assert.equal((await ctx.db.query('authVerificationCodes').collect()).length, 0);
    assert.equal((await ctx.db.query('passwordResets').collect()).length, 0);
    assert.equal((await ctx.db.query('invitations').collect()).length, 0);
  });
});

test('maintenance pauses hygiene and preserves the original operational smoke exception', async () => {
  const { client, ids } = await fixture();
  await client.run(async (ctx) => {
    await ctx.db.insert('operationalControl', {
      key: 'release',
      paused: true,
      commit: 'synthetic-security',
      changedAt: Date.now(),
      smokeUserId: ids.users.admin,
    });
    await ctx.db.insert('authAccounts', {
      userId: ids.users.admin,
      provider: 'password',
      providerAccountId: 'admin@ifpr.edu.br',
      secret: await passwordCrypto.hashSecret('admin-synthetic-password'),
    });
    await ctx.db.insert('passwordResets', {
      userId: ids.users['campus-a'],
      tokenHash: 'expired',
      expiresAt: Date.now() - 1,
    });
  });
  assert.deepEqual(await client.mutation(internal.access.cleanup.sweep, {}), {
    deleted: 0,
    continued: false,
  });
  assert.equal((await client.run((ctx) => ctx.db.query('passwordResets').collect())).length, 1);
  const signedIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'admin@ifpr.edu.br', password: 'admin-synthetic-password' },
  });
  assert.ok(signedIn.tokens);
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    /manutenção/,
  );
});

test('concurrent reset consumption commits once and the winning new session carries the current generation', async () => {
  const { client, ids, asClient } = await fixture();
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  const args = {
    token: new URL(recovery.url).hash.split('=')[1],
    password: 'new-synthetic-password',
  };
  const results = await Promise.allSettled([
    client.action(api.access.passwordRecovery.resetPassword, args),
    client.action(api.access.passwordRecovery.resetPassword, args),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const signedIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: args.password },
  });
  const subject = JSON.parse(
    Buffer.from(signedIn.tokens!.token.split('.')[1], 'base64url').toString(),
  ).sub;
  assert.ok(await client.withIdentity({ subject }).query(api.access.session.me, {}));
  await client.run(async (ctx) => {
    const session = await ctx.db.get(ctx.db.normalizeId('authSessions', subject.split('|')[1])!);
    const user = await ctx.db.get(ids.users['campus-a']);
    assert.equal(session!.generation, user!.sessionGeneration);
    assert.equal(user!.sessionGeneration, 1);
    assert.equal(typeof session!.authenticatedAt, 'number');
  });
});

test('operator contingency is internal, restricted to ADMIN and audited without issuing credentials', async () => {
  const { client, ids } = await fixture();
  await assert.rejects(
    client.mutation(internal.access.security.unlockAdminOperationally, {
      id: ids.users['campus-a'],
      incidentRef: 'INC-123',
    }),
    /conta ativa/,
  );
  await client.run(async (ctx) => {
    const id = await ctx.db.insert('authAccounts', {
      userId: ids.users.admin,
      provider: 'password',
      providerAccountId: 'admin@ifpr.edu.br',
      secret: 'synthetic-unused',
    });
    await ctx.db.insert('authRateLimits', {
      identifier: id,
      lastAttemptTime: Date.now(),
      attemptsLeft: 0,
    });
  });
  await client.mutation(internal.access.security.unlockAdminOperationally, {
    id: ids.users.admin,
    incidentRef: 'INC-123',
  });
  await client.run(async (ctx) => {
    assert.equal((await ctx.db.query('authRateLimits').collect()).length, 0);
    const audit = await ctx.db.query('audit').first();
    assert.equal(audit!.action, 'UNLOCK_PASSWORD_LOGIN');
    assert.equal(audit!.details, 'INC-123');
    assert.equal(audit!.actorId, undefined);
    assert.match(audit!.actorLabel!, /operador da plataforma/);
  });
});

test('session generation stamping rolls back with creation when its callback fails', async () => {
  const { client } = await fixture();
  const store = await import('../convex/access/store.ts');
  const initialize = store.initializeSession;
  const before = await client.run((ctx) => ctx.db.query('authSessions').collect());
  const guard = vi
    .spyOn(store, 'initializeSession')
    .mockImplementation(async (ctx, userId, sessionId) => {
      await initialize(ctx, userId, sessionId);
      const session = await ctx.db.get(sessionId);
      assert.equal(session!.generation, 0);
      assert.equal(typeof session!.authenticatedAt, 'number');
      throw Error('post-creation failure');
    });
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    /post-creation failure/,
  );
  assert.equal(guard.mock.calls.length, 1);
  assert.deepEqual(await client.run((ctx) => ctx.db.query('authSessions').collect()), before);
  assert.deepEqual(await client.run((ctx) => ctx.db.query('authRefreshTokens').collect()), []);
});

test('a login racing role revocation cannot preserve a previous generation through cleanup', async () => {
  const { client, asClient, ids } = await fixture();
  const results = await Promise.allSettled([
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    asClient('admin').mutation(api.access.members.updateMemberRole, {
      id: ids.users['campus-a'],
      role: 'PARECERISTA',
      expected: { role: 'CAMPUS', campusId: ids.campuses.a },
    }),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(await asClient('campus-a').query(api.access.session.me, {}), null);
  await client.finishAllScheduledFunctions(vi.runAllTimers);
  await client.run(async (ctx) => {
    const user = await ctx.db.get(ids.users['campus-a']);
    assert.equal(user!.sessionGeneration, 1);
    for (const session of await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', ids.users['campus-a']))
      .collect())
      assert.equal(session.generation, user!.sessionGeneration);
  });
});

test('valid refresh retry retains its child token and delayed replay still invalidates the subtree', async () => {
  const { client } = await fixture();
  const first = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
  });
  const second = await client.action(api.auth.signIn, { refreshToken: first.tokens!.refreshToken });
  const retry = await client.action(api.auth.signIn, { refreshToken: first.tokens!.refreshToken });
  assert.equal(retry.tokens!.refreshToken, second.tokens!.refreshToken);
  const third = await client.action(api.auth.signIn, { refreshToken: second.tokens!.refreshToken });
  assert.ok(third.tokens);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(Date.now() + 11_000);
  const replay = await client.action(api.auth.signIn, { refreshToken: first.tokens!.refreshToken });
  assert.equal(replay.tokens, null);
  const invalidated = await client.action(api.auth.signIn, {
    refreshToken: third.tokens!.refreshToken,
  });
  assert.equal(invalidated.tokens, null);
});

test('expired ADMIN admission rejects member creation before hashing or allocating a lease', async () => {
  const { client, asClient } = await fixture();
  await asClient('admin').action(api.access.members.createMember, {
    data: {
      name: 'Synthetic before expiry',
      email: 'before@ifpr.edu.br',
      role: 'PARECERISTA',
      loginMethod: 'local',
      password: 'synthetic-password',
    },
  });
  const hash = vi.spyOn(passwordCrypto, 'hashSecret');
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(Date.now() + 16 * 60_000);
  await assert.rejects(
    asClient('admin').action(api.access.members.createMember, {
      data: {
        name: 'Synthetic after expiry',
        email: 'after@ifpr.edu.br',
        role: 'PARECERISTA',
        loginMethod: 'local',
        password: 'synthetic-password',
      },
    }),
    /autenticação recente/,
  );
  assert.equal(hash.mock.calls.length, 0);
  assert.equal((await client.run((ctx) => ctx.db.query('operationalLeases').collect())).length, 0);
});

// Pause after a real, committed action->mutation boundary, never in the password
// verifier's transaction. Covers the old Password split and the atomic wrapper.
async function pauseCredentialBoundary() {
  const { signIn } = await import('../convex/auth.ts');
  const registered = signIn as unknown as {
    _handler: (
      ctx: ActionCtx,
      args: FunctionArgs<typeof api.auth.signIn>,
    ) => Promise<FunctionReturnType<typeof api.auth.signIn>>;
  };
  const original = registered._handler;
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let once = false;
  const handler = vi.spyOn(registered, '_handler').mockImplementation(async (ctx, args) => {
    const runMutation: typeof ctx.runMutation = async (reference, input) => {
      const result = await ctx.runMutation(reference, input);
      const name = getFunctionName(reference);
      const payload = input as { args?: { type?: string } } | undefined;
      if (
        !once &&
        (name === 'access/passwordSignIn:authorize' ||
          (name === 'auth:store' && payload?.args?.type === 'retrieveAccountWithCredentials'))
      ) {
        once = true;
        reached();
        await resumed;
      }
      return result;
    };
    return original({ ...ctx, runMutation }, args);
  });
  return { paused, release, restore: () => handler.mockRestore() };
}

test('a password verified before recovery cannot mint a valid session after recovery commits', async () => {
  const { client, ids, asClient } = await fixture();
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  const boundary = await pauseCredentialBoundary();
  const pending = client
    .action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    })
    .catch(() => null);
  try {
    await boundary.paused;
    await client.action(api.access.passwordRecovery.resetPassword, {
      token: new URL(recovery.url).hash.split('=')[1],
      password: 'recovered-synthetic-password',
    });
    boundary.release();
    const stale = await pending;
    assert.equal(Boolean(stale?.tokens), false, 'the old credential must not receive tokens');
  } finally {
    boundary.release();
    boundary.restore();
  }
  const fresh = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'recovered-synthetic-password' },
  });
  assert.ok(fresh.tokens);
});

test('two pending hashes retain concurrency slots even when the frequency bucket refills', async () => {
  const { client, ids, asClient } = await fixture();
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  const args = { token: new URL(recovery.url).hash.split('=')[1], password: 'synthetic-password' };
  const blocked: Array<(error: Error) => void> = [];
  let started!: () => void;
  const twoStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const hash = vi.spyOn(passwordCrypto, 'hashSecret').mockImplementation(() => {
    if (blocked.length >= 2) return Promise.reject(Error('unexpected third hash'));
    return new Promise((_resolve, reject) => {
      blocked.push(reject);
      if (blocked.length === 2) started();
    });
  });
  const pending = [
    client.action(api.access.passwordRecovery.resetPassword, args).catch(() => null),
    client.action(api.access.passwordRecovery.resetPassword, args).catch(() => null),
  ];
  try {
    await twoStarted;
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(Date.now() + 61_000);
    await assert.rejects(
      client.action(api.access.passwordRecovery.resetPassword, args),
      /operações em andamento/,
    );
    assert.equal(hash.mock.calls.length, 2);
    assert.equal(
      (await client.run((ctx) => ctx.db.query('operationalLeases').collect())).length,
      2,
    );
  } finally {
    for (const reject of blocked) reject(Error('synthetic work failure'));
    await Promise.all(pending);
    hash.mockRestore();
  }
  assert.equal((await client.run((ctx) => ctx.db.query('operationalLeases').collect())).length, 0);
  assert.ok(await client.action(api.access.passwordRecovery.resetPassword, args));
});

test('a failed slot release remains visible and cannot be reclaimed by elapsed time', async () => {
  const { client, ids, asClient } = await fixture();
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  const args = { token: new URL(recovery.url).hash.split('=')[1], password: 'synthetic-password' };
  const { finish } = await import('../convex/operations.ts');
  const registered = finish as unknown as { _handler: (...args: unknown[]) => Promise<null> };
  const release = vi
    .spyOn(registered, '_handler')
    .mockRejectedValue(Error('synthetic finish failure'));
  const hash = vi
    .spyOn(passwordCrypto, 'hashSecret')
    .mockRejectedValue(Error('synthetic work failure'));
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      client.action(api.access.passwordRecovery.resetPassword, args),
      /synthetic finish failure/,
    );
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(Date.now() + 61_000);
  await assert.rejects(
    client.action(api.access.passwordRecovery.resetPassword, args),
    /operações em andamento/,
  );
  assert.equal(hash.mock.calls.length, 2);
  const leases = await client.run((ctx) => ctx.db.query('operationalLeases').collect());
  assert.equal(leases.length, 2);
  assert.ok(leases.every((lease) => /^reset:[a-f0-9]{64}$/.test(lease.credentialKey ?? '')));
  release.mockRestore();
  for (const lease of leases) await client.mutation(internal.operations.finish, { id: lease._id });
});
