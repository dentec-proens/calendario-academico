import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, scryptSync } from 'node:crypto';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { tsImport } from 'tsx/esm/api';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

const ref = (name) => makeFunctionReference(name);
const { passwordCrypto, legacySecret } = await tsImport('../convex/authCrypto.ts', import.meta.url);
const schema = await tsImport('../convex/schema.ts', import.meta.url);
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.CONVEX_SITE_URL = 'https://isolated-auth-test.convex.site';
process.env.SITE_URL = 'http://127.0.0.1:4183';

async function fixture() {
  const client = convexTest(schema.default, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/nativeAuth.ts': () => tsImport('../convex/nativeAuth.ts', import.meta.url),
    '../convex/auth.ts': () => tsImport('../convex/auth.ts', import.meta.url),
  });
  const ids = await client.run(async (ctx) => {
    const campus = { id: 'campus-original', name: 'Campus de teste' };
    await ctx.db.insert('campuses', {
      key: `campuses:${campus.id}`,
      position: 0,
      appId: campus.id,
      value: encodeValue(campus),
    });
    const users = [
      {
        id: 'original-admin-uuid',
        name: 'Admin',
        email: 'admin-native@ifpr.edu.br',
        role: 'ADMIN',
        campusId: null,
        active: true,
        loginMethod: 'local',
      },
      {
        id: 'original-campus-uuid',
        name: 'Campus',
        email: 'campus-native@ifpr.edu.br',
        role: 'CAMPUS',
        campusId: campus.id,
        active: true,
        loginMethod: 'local',
      },
    ];
    const result = [];
    for (const [position, user] of users.entries()) {
      const salt = '0123456789abcdef0123456789abcdef';
      const hash = scryptSync('synthetic-password', salt, 64).toString('hex');
      const id = await ctx.db.insert('users', {
        key: `users:${user.id}`,
        position,
        appId: user.id,
        email: user.email,
        value: encodeValue(user),
      });
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
      result.push({ id, sessionId, user });
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

test('native sign-in preserves application IDs and keeps secrets exclusively in Convex Auth', async () => {
  const { client, admin, asAdmin } = await fixture();
  const row = await client.run((ctx) => ctx.db.get(admin.id));
  const user = decodeValue(row.value);
  assert.equal(user.id, 'original-admin-uuid');
  assert.equal(user.salt, undefined);
  assert.equal(user.hash, undefined);
  const account = await client.run((ctx) =>
    ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', admin.id).eq('provider', 'password'))
      .unique(),
  );
  assert.equal(await passwordCrypto.verifySecret('synthetic-password', account.secret), true);
  assert.equal((await asAdmin.query(ref('nativeAuth:me'), {})).id, user.id);
  const signIn = await client.action(ref('auth:signIn'), {
    provider: 'password',
    params: { flow: 'signIn', email: ' ADMIN-NATIVE@IFPR.EDU.BR ', password: 'synthetic-password' },
  });
  assert.ok(signIn.tokens.token);
  const payload = JSON.parse(
    Buffer.from(signIn.tokens.token.split('.')[1], 'base64url').toString(),
  );
  assert.match(payload.sub, new RegExp(`^${admin.id}\\|`));
  assert.equal((await client.run((ctx) => ctx.db.query('users').take(10))).length, 2);
});

test('native auth rejects public registration, unknown users and campus administration', async () => {
  const { client, asCampus } = await fixture();
  await assert.rejects(
    client.action(ref('auth:signIn'), {
      provider: 'password',
      params: { flow: 'signUp', email: 'intruder@ifpr.edu.br', password: 'synthetic-password' },
    }),
    /Solicite seu acesso/,
  );
  await assert.rejects(
    client.action(ref('auth:signIn'), {
      provider: 'password',
      params: { flow: 'signIn', email: 'unknown@ifpr.edu.br', password: 'synthetic-password' },
    }),
  );
  await assert.rejects(
    asCampus.action(ref('nativeAuth:createMember'), {
      data: {
        name: 'Denied',
        email: 'denied@ifpr.edu.br',
        password: 'synthetic-password',
        role: 'ADMIN',
      },
    }),
    /exclusivo da administra/,
  );
  assert.equal(await client.query(ref('nativeAuth:me'), {}), null);
  assert.equal((await client.run((ctx) => ctx.db.query('users').take(10))).length, 2);
});

test('native auth refuses inactive, removed or inconsistent imported identities despite correct passwords', async () => {
  for (const invalid of [
    { active: false },
    { active: 'true' },
    { campusId: null },
    { name: null },
    { email: 'inconsistent@ifpr.edu.br' },
    { removedAt: '2026-10-23T00:00:00Z' },
    { role: 'UNRECOGNIZED' },
    { id: 'mismatched-application-id' },
  ]) {
    const { client, campus, asCampus } = await fixture();
    await client.run(async (ctx) => {
      const row = await ctx.db.get(campus.id);
      await ctx.db.patch(campus.id, {
        value: encodeValue({ ...decodeValue(row.value), ...invalid }),
      });
    });
    assert.equal(await asCampus.query(ref('nativeAuth:me'), {}), null);
    await assert.rejects(
      client.action(ref('auth:signIn'), {
        provider: 'password',
        params: { flow: 'signIn', email: campus.user.email, password: 'synthetic-password' },
      }),
      /Solicite seu acesso/,
    );
  }
});

test('native invitations activate only the intended member and cannot be reused', async () => {
  const { client, asAdmin } = await fixture();
  const invited = await asAdmin.action(ref('nativeAuth:createMember'), {
    data: {
      name: 'Convidado',
      email: 'invite-native@ifpr.edu.br',
      role: 'CAMPUS',
      campusId: 'campus-original',
      loginMethod: 'invite',
    },
  });
  const token = new URL(invited.inviteUrl).hash.split('=')[1];
  assert.equal(
    (await client.query(ref('nativeAuth:checkInvitation'), { token })).email,
    'invite-native@ifpr.edu.br',
  );
  await assert.rejects(
    client.action(ref('nativeAuth:acceptInvitation'), {
      token,
      email: 'different@ifpr.edu.br',
      password: 'synthetic-invite-password',
    }),
    /Convite inválido/,
  );
  await client.action(ref('nativeAuth:acceptInvitation'), {
    token,
    email: 'invite-native@ifpr.edu.br',
    password: 'synthetic-invite-password',
  });
  await assert.rejects(
    client.query(ref('nativeAuth:checkInvitation'), { token }),
    /Convite inválido/,
  );
  await assert.rejects(
    client.action(ref('nativeAuth:acceptInvitation'), {
      token,
      email: 'invite-native@ifpr.edu.br',
      password: 'synthetic-other-password',
    }),
    /Convite inválido/,
  );
  const row = await client.run((ctx) =>
    ctx.db
      .query('users')
      .withIndex('by_appId', (q) => q.eq('appId', invited.id))
      .unique(),
  );
  const member = decodeValue(row.value);
  assert.equal(member.active, true);
  assert.equal(member.loginMethod, 'local');
  assert.equal(member.hash, undefined);
  const signIn = await client.action(ref('auth:signIn'), {
    provider: 'password',
    params: { flow: 'signIn', email: member.email, password: 'synthetic-invite-password' },
  });
  assert.ok(signIn.tokens.token);
});

test('native manual recovery replaces credentials atomically and revokes existing sessions immediately', async () => {
  const { client, campus, asAdmin, asCampus } = await fixture();
  const oldRecovery = await asAdmin.mutation(ref('nativeAuth:passwordRecovery'), {
    id: campus.user.id,
  });
  const recovery = await asAdmin.mutation(ref('nativeAuth:passwordRecovery'), {
    id: campus.user.id,
  });
  const oldToken = new URL(oldRecovery.url).hash.split('=')[1];
  const token = new URL(recovery.url).hash.split('=')[1];
  await assert.rejects(
    client.action(ref('nativeAuth:resetPassword'), {
      token: oldToken,
      password: 'new-synthetic-password',
    }),
    /Link inválido/,
  );
  await client.action(ref('nativeAuth:resetPassword'), {
    token,
    password: 'new-synthetic-password',
  });
  assert.equal(await asCampus.query(ref('nativeAuth:me'), {}), null);
  assert.equal(await client.run((ctx) => ctx.db.get(campus.sessionId)), null);
  await assert.rejects(
    client.action(ref('nativeAuth:resetPassword'), { token, password: 'other-synthetic-password' }),
    /Link inválido/,
  );
  await assert.rejects(
    client.action(ref('auth:signIn'), {
      provider: 'password',
      params: { flow: 'signIn', email: campus.user.email, password: 'synthetic-password' },
    }),
  );
  const signedIn = await client.action(ref('auth:signIn'), {
    provider: 'password',
    params: { flow: 'signIn', email: campus.user.email, password: 'new-synthetic-password' },
  });
  assert.ok(signedIn.tokens.token);
});

test('native member removal preserves audit and blocks valid JWT sessions immediately', async () => {
  const { client, campus, admin, asAdmin, asCampus } = await fixture();
  await assert.rejects(
    asAdmin.mutation(ref('nativeAuth:removeMember'), { id: admin.user.id }),
    /próprio acesso/,
  );
  await asAdmin.mutation(ref('nativeAuth:removeMember'), { id: campus.user.id });
  assert.equal(await asCampus.query(ref('nativeAuth:me'), {}), null);
  assert.equal(await client.run((ctx) => ctx.db.get(campus.sessionId)), null);
  const row = await client.run((ctx) => ctx.db.get(campus.id));
  assert.equal(decodeValue(row.value).active, false);
  const audit = await client.run((ctx) => ctx.db.query('audit').withIndex('by_position').take(10));
  assert.equal(decodeValue(audit.at(-1).value).action, 'REMOVE_MEMBER');
});

test('native account creation checks administrator access before validating credentials or hashing a password', async () => {
  const { client, asCampus } = await fixture();
  const data = {
    name: 'Pedido sintético sem autorização',
    email: 'not-an-institutional-email',
    password: 'short',
    role: 'ADMIN',
  };
  await assert.rejects(
    client.action(ref('nativeAuth:createMember'), { data }),
    (error) => error.data?.status === 401 && /Entre com sua conta/.test(error.data.error),
  );
  await assert.rejects(
    asCampus.action(ref('nativeAuth:createMember'), { data }),
    (error) =>
      error.data?.status === 403 && /Acesso exclusivo da administra/.test(error.data.error),
  );
  assert.equal((await client.run((ctx) => ctx.db.query('users').collect())).length, 2);
  assert.equal((await client.run((ctx) => ctx.db.query('authAccounts').collect())).length, 2);
});
