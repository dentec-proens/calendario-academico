import { ConvexError } from 'convex/values';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { generateKeyPairSync, scryptSync } from 'node:crypto';
import { convexTest } from 'convex-test';
import { api } from '../convex/_generated/api.js';

const { passwordCrypto, legacySecret } = await import('../convex/authCrypto.ts');
const { default: schema } = await import('../convex/schema.ts');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.CONVEX_SITE_URL = 'https://isolated-auth-test.convex.site';
process.env.SITE_URL = 'http://127.0.0.1:4183';

async function fixture() {
  const client = convexTest(schema, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/nativeAuth.ts': () => import('../convex/nativeAuth.ts'),
    '../convex/auth.ts': () => import('../convex/auth.ts'),
  });
  const ids = await client.run(async (ctx) => {
    const campusId = await ctx.db.insert('campuses', { name: 'Campus de teste', archived: false });
    const users = [
      {
        name: 'Admin',
        email: 'admin-native@ifpr.edu.br',
        role: 'ADMIN' as const,
        active: true,
        loginMethod: 'local' as const,
      },
      {
        name: 'Campus',
        email: 'campus-native@ifpr.edu.br',
        role: 'CAMPUS' as const,
        campusId,
        active: true,
        loginMethod: 'local' as const,
      },
    ];
    const result = [];
    for (const user of users) {
      const salt = '0123456789abcdef0123456789abcdef';
      const hash = scryptSync('synthetic-password', salt, 64).toString('hex');
      const id = await ctx.db.insert('users', user);
      await ctx.db.insert('authAccounts', {
        userId: id,
        provider: 'password',
        providerAccountId: user.email,
        secret: legacySecret(salt, hash),
      });
      const sessionId = await ctx.db.insert('authSessions', {
        userId: id,
        expirationTime: Date.now() + 3600000,
      });
      result.push({ id, sessionId, user: { ...user, id } });
    }
    return result;
  });
  const [admin, campus] = ids;
  return {
    client,
    admin,
    campus,
    asAdmin: client.withIdentity({ subject: `${admin.id}|${admin.sessionId}` }),
    asCampus: client.withIdentity({ subject: `${campus.id}|${campus.sessionId}` }),
  };
}

test('native password crypto verifies the original Node scrypt credentials', async () => {
  const salt = 'ffeeddccbbaa99887766554433221100';
  const hash = scryptSync('senha sintética 123', salt, 64).toString('hex');
  const secret = legacySecret(salt, hash);
  assert.equal(await passwordCrypto.verifySecret('senha sintética 123', secret), true);
  assert.equal(await passwordCrypto.verifySecret('outra senha 123', secret), false);
  assert.equal(await passwordCrypto.verifySecret('short', secret), false);
  assert.equal(await passwordCrypto.verifySecret('senha sintética 123', 'malformed'), false);
  const generated = await passwordCrypto.hashSecret('nova senha 123');
  assert.equal(await passwordCrypto.verifySecret('nova senha 123', generated), true);
  await assert.rejects(passwordCrypto.hashSecret('short'), /10 e 128/);
});

test('native sign-in preserves native user IDs and keeps migrated secrets exclusively in Convex Auth', async () => {
  const { client, admin, asAdmin } = await fixture();
  const row = await client.run((ctx) => ctx.db.get(admin.id));
  assert.equal(row!._id, admin.id);
  assert.equal('salt' in row!, false);
  assert.equal('hash' in row!, false);
  const account = await client.run((ctx) =>
    ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', admin.id).eq('provider', 'password'))
      .unique(),
  );
  assert.equal(await passwordCrypto.verifySecret('synthetic-password', account!.secret!), true);
  assert.equal((await asAdmin.query(api.nativeAuth.me, {}))!.id, admin.id);
  const signIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: ' ADMIN-NATIVE@IFPR.EDU.BR ', password: 'synthetic-password' },
  });
  assert.ok(signIn.tokens!.token);
  const payload = JSON.parse(
    Buffer.from(signIn.tokens!.token.split('.')[1], 'base64url').toString(),
  );
  assert.match(payload.sub, new RegExp(`^${admin.id}\\|`));
  assert.equal((await client.run((ctx) => ctx.db.query('users').take(10))).length, 2);
});

test('native auth rejects public registration, unknown users and campus administration', async () => {
  const { client, asCampus } = await fixture();
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'intruder@ifpr.edu.br', password: 'synthetic-password' },
    }),
    /Solicite seu acesso/,
  );
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'unknown@ifpr.edu.br', password: 'synthetic-password' },
    }),
  );
  await assert.rejects(
    asCampus.action(api.nativeAuth.createMember, {
      data: {
        name: 'Denied',
        email: 'denied@ifpr.edu.br',
        password: 'synthetic-password',
        role: 'ADMIN' as const,
      },
    }),
    /exclusivo da administra/,
  );
  assert.equal(await client.query(api.nativeAuth.me, {}), null);
  assert.equal((await client.run((ctx) => ctx.db.query('users').take(10))).length, 2);
});

test('native auth refuses inactive, removed, unassigned or noninstitutional identities despite correct passwords', async () => {
  for (const invalid of [
    { active: false },
    { campusId: undefined },
    { email: 'external@example.org' },
    { removedAt: Date.now() },
  ]) {
    const { client, campus, asCampus } = await fixture();
    await client.run((ctx) => ctx.db.patch(campus.id, invalid));
    assert.equal(await asCampus.query(api.nativeAuth.me, {}), null);
    await assert.rejects(
      client.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'signIn', email: campus.user.email, password: 'synthetic-password' },
      }),
      /Solicite seu acesso/,
    );
  }
});

test('native invitations activate only the intended member and cannot be reused', async () => {
  const { client, asAdmin, campus } = await fixture();
  const invited = await asAdmin.action(api.nativeAuth.createMember, {
    data: {
      name: 'Convidado',
      email: 'invite-native@ifpr.edu.br',
      role: 'CAMPUS',
      campusId: campus.user.campusId!,
      loginMethod: 'invite',
    },
  });
  const token = new URL(invited.inviteUrl!).hash.split('=')[1];
  assert.equal(
    (await client.query(api.nativeAuth.checkInvitation, { token })).email,
    'invite-native@ifpr.edu.br',
  );
  await assert.rejects(
    client.action(api.nativeAuth.acceptInvitation, {
      token,
      email: 'different@ifpr.edu.br',
      password: 'synthetic-invite-password',
    }),
    /Convite inválido/,
  );
  await client.action(api.nativeAuth.acceptInvitation, {
    token,
    email: 'invite-native@ifpr.edu.br',
    password: 'synthetic-invite-password',
  });
  await assert.rejects(client.query(api.nativeAuth.checkInvitation, { token }), /Convite inválido/);
  await assert.rejects(
    client.action(api.nativeAuth.acceptInvitation, {
      token,
      email: 'invite-native@ifpr.edu.br',
      password: 'synthetic-other-password',
    }),
    /Convite inválido/,
  );
  const member = await client.run((ctx) => ctx.db.get(invited.id));
  assert.equal(member!.active, true);
  assert.equal(member!.loginMethod, 'local');
  assert.equal('hash' in member!, false);
  const signIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: member!.email, password: 'synthetic-invite-password' },
  });
  assert.ok(signIn.tokens!.token);
});

test('native manual recovery replaces credentials atomically and revokes existing sessions immediately', async () => {
  const { client, campus, asAdmin, asCampus } = await fixture();
  const oldRecovery = await asAdmin.mutation(api.nativeAuth.passwordRecovery, {
    id: campus.user.id,
  });
  const recovery = await asAdmin.mutation(api.nativeAuth.passwordRecovery, {
    id: campus.user.id,
  });
  const oldToken = new URL(oldRecovery.url).hash.split('=')[1];
  const token = new URL(recovery.url).hash.split('=')[1];
  await assert.rejects(
    client.action(api.nativeAuth.resetPassword, {
      token: oldToken,
      password: 'new-synthetic-password',
    }),
    /Link inválido/,
  );
  await client.action(api.nativeAuth.resetPassword, {
    token,
    password: 'new-synthetic-password',
  });
  assert.equal(await asCampus.query(api.nativeAuth.me, {}), null);
  assert.equal(await client.run((ctx) => ctx.db.get(campus.sessionId)), null);
  await assert.rejects(
    client.action(api.nativeAuth.resetPassword, { token, password: 'other-synthetic-password' }),
    /Link inválido/,
  );
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: campus.user.email, password: 'synthetic-password' },
    }),
  );
  const signedIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: campus.user.email, password: 'new-synthetic-password' },
  });
  assert.ok(signedIn.tokens!.token);
});

test('native member removal preserves audit and blocks valid JWT sessions immediately', async () => {
  const { client, campus, admin, asAdmin, asCampus } = await fixture();
  await assert.rejects(
    asAdmin.mutation(api.nativeAuth.removeMember, { id: admin.user.id }),
    /próprio acesso/,
  );
  await asAdmin.mutation(api.nativeAuth.removeMember, { id: campus.user.id });
  assert.equal(await asCampus.query(api.nativeAuth.me, {}), null);
  assert.equal(await client.run((ctx) => ctx.db.get(campus.sessionId)), null);
  const row = await client.run((ctx) => ctx.db.get(campus.id));
  assert.equal(row!.active, false);
  const audit = await client.run((ctx) => ctx.db.query('audit').take(10));
  assert.equal(audit.at(-1)!.action, 'REMOVE_MEMBER');
  assert.deepEqual(audit.at(-1)!.target, { type: 'user', id: campus.id });
});

test('native account creation checks administrator access before validating credentials or hashing a password', async () => {
  const { client, asCampus } = await fixture();
  const data = {
    name: 'Pedido sintético sem autorização',
    email: 'not-an-institutional-email',
    password: 'short',
    role: 'ADMIN' as const,
  };
  await assert.rejects(
    client.action(api.nativeAuth.createMember, { data }),
    (error: unknown) =>
      error instanceof ConvexError &&
      error.data?.status === 401 &&
      /Entre com sua conta/.test(error.data.error),
  );
  await assert.rejects(
    asCampus.action(api.nativeAuth.createMember, { data }),
    (error: unknown) =>
      error instanceof ConvexError &&
      error.data?.status === 403 &&
      /Acesso exclusivo da administra/.test(error.data.error),
  );
  assert.equal((await client.run((ctx) => ctx.db.query('users').collect())).length, 2);
  assert.equal((await client.run((ctx) => ctx.db.query('authAccounts').collect())).length, 2);
});

test('reissued native invitations invalidate earlier tokens and clear activation metadata', async () => {
  const { client, asAdmin, campus } = await fixture();
  const invited = await asAdmin.action(api.nativeAuth.createMember, {
    data: {
      name: 'Convidado reemitido',
      email: 'reissued@ifpr.edu.br',
      role: 'CAMPUS',
      campusId: campus.user.campusId!,
      loginMethod: 'invite',
    },
  });
  const oldToken = new URL(invited.inviteUrl!).hash.split('=')[1];
  const reissued = await asAdmin.mutation(api.nativeAuth.issueInvitation, { id: invited.id });
  const token = new URL(reissued.inviteUrl).hash.split('=')[1];
  await assert.rejects(
    client.query(api.nativeAuth.checkInvitation, { token: oldToken }),
    /Convite inválido/,
  );
  assert.equal(
    (await client.query(api.nativeAuth.checkInvitation, { token })).campus,
    'Campus de teste',
  );
  await client.action(api.nativeAuth.acceptInvitation, {
    token,
    email: invited.email,
    password: 'synthetic-invite-password',
  });
  const row = await client.run((ctx) => ctx.db.get(invited.id));
  assert.equal(row!.inviteExpiresAt, undefined);
  assert.equal(row!.nativeInviteHash, undefined);
  const invitations = await client.run((ctx) =>
    ctx.db
      .query('invitations')
      .withIndex('by_userId', (q) => q.eq('userId', invited.id))
      .take(3),
  );
  assert.equal(invitations.length, 2);
  assert.equal(invitations.filter((invite) => invite.usedAt !== undefined).length, 1);
});
