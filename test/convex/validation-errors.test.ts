import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { afterEach, test, vi } from 'vitest';
import { ConvexError } from 'convex/values';
import { api, internal } from '../../convex/_generated/api';
import { legacySecret } from '../../convex/authCrypto';
import { revokeSessions } from '../../convex/access/store';
import { inviteError } from '../../convex/access/invitations';
import { resetError } from '../../convex/access/passwordRecovery';
import { nativeError } from '../../web/shared/convex/errors';
import { createNativeFixture } from '../helpers/native-database';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function rejectsValidation(operation: Promise<unknown>, message: string, status = 400) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ConvexError);
    assert.deepEqual(error.data, { error: message, status });
    const displayed = nativeError(error);
    assert.equal(displayed.message, message);
    assert.equal(displayed.status, status);
    return true;
  });
}

test('account administration exposes expected refusals and preserves the member', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const admin = asClient('admin');
  const before = await client.run((ctx) => ctx.db.get(ids.users.admin));
  await rejectsValidation(
    admin.mutation(api.access.members.removeMember, { id: ids.users.admin }),
    'Você não pode excluir seu próprio acesso.',
  );
  await rejectsValidation(
    admin.mutation(api.access.members.updateMemberRole, {
      id: ids.users.admin,
      expected: { role: 'ADMIN', campusId: null },
      role: 'PARECERISTA',
    }),
    'É necessário manter um administrador ativo.',
    409,
  );
  await client.run((ctx) => ctx.db.patch(ids.campuses.b, { archived: true }));
  await rejectsValidation(
    admin.mutation(api.access.members.updateMemberRole, {
      id: ids.users['campus-a'],
      expected: { role: 'CAMPUS', campusId: ids.campuses.a },
      role: 'CAMPUS',
      campusId: ids.campuses.b,
    }),
    'Selecione um campus ativo.',
  );
  await client.run((ctx) => ctx.db.delete(ids.users['campus-b']));
  await rejectsValidation(
    admin.mutation(api.access.members.removeMember, { id: ids.users['campus-b'] }),
    'Membro não encontrado.',
    404,
  );
  assert.deepEqual(await client.run((ctx) => ctx.db.get(ids.users.admin)), before);
  assert.equal((await client.run((ctx) => ctx.db.query('audit').take(10))).length, 0);
});

test('invitation queries and actions expose the same safe invalid-link message', async () => {
  const { client } = await createNativeFixture();
  for (const token of ['invalid', 'a'.repeat(43)]) {
    await rejectsValidation(
      client.query(api.access.invitations.checkInvitation, { token }),
      inviteError,
    );
    await rejectsValidation(
      client.action(api.access.invitations.acceptInvitation, {
        token,
        email: 'a@ifpr.edu.br',
        password: 'synthetic-password',
      }),
      inviteError,
    );
  }
  assert.equal((await client.run((ctx) => ctx.db.query('operationalLeases').take(10))).length, 0);
});

test('password recovery actions expose invalid links and the unavailable email recovery service', async () => {
  const { client } = await createNativeFixture();
  for (const token of ['invalid', 'a'.repeat(64)])
    await rejectsValidation(
      client.action(api.access.passwordRecovery.resetPassword, {
        token,
        password: 'synthetic-password',
      }),
      resetError,
    );
  await rejectsValidation(
    client.action(api.access.passwordRecovery.requestPasswordRecovery, { email: 'a@ifpr.edu.br' }),
    'A recuperação por e-mail ainda não está configurada. Entre em contato com dentec.proens@ifpr.edu.br.',
    503,
  );
});

test('credential admission throttling reaches the public reset action without releasing accepted work', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  await client.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: ids.users['campus-a'],
      provider: 'password',
      providerAccountId: 'a@ifpr.edu.br',
      secret: 'synthetic',
    }),
  );
  const recovery = await asClient('admin').mutation(api.access.passwordRecovery.passwordRecovery, {
    id: ids.users['campus-a'],
  });
  const token = new URL(recovery.url).hash.split('=')[1];
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await client.mutation(internal.access.admission.credentialWork, { kind: 'reset', token }))
        .ok,
      true,
    );
  await rejectsValidation(
    client.action(api.access.passwordRecovery.resetPassword, {
      token,
      password: 'synthetic-password',
    }),
    'Há duas operações em andamento para este link. Aguarde sua conclusão.',
    429,
  );
  const leases = await client.run((ctx) => ctx.db.query('operationalLeases').take(10));
  assert.equal(leases.length, 2);
  for (const lease of leases) await client.mutation(internal.operations.finish, { id: lease._id });
  await rejectsValidation(
    client.action(api.access.passwordRecovery.resetPassword, {
      token,
      password: 'synthetic-password',
    }),
    'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
    429,
  );
});

test('unlock and recovery refuse unsuitable accounts with actionable validation errors', async () => {
  const { asClient, ids } = await createNativeFixture();
  const admin = asClient('admin');
  await rejectsValidation(
    admin.mutation(api.access.security.unlockPassword, { id: ids.users['campus-a'] }),
    'A conta ainda não possui senha local.',
  );
  await rejectsValidation(
    admin.mutation(api.access.passwordRecovery.passwordRecovery, { id: ids.users['campus-a'] }),
    'A recuperação exige uma conta ativa com senha local. Para novos usuários, gere um convite.',
  );
  await rejectsValidation(
    admin.mutation(api.access.invitations.issueInvitation, { id: ids.users['campus-a'] }),
    inviteError,
  );
});

test('setup refusals are safe client errors and leave no action lease', async () => {
  const { client } = await createNativeFixture();
  vi.stubEnv('DENTEC_SETUP_CODE', 'synthetic-setup-code');
  await rejectsValidation(
    client.action(api.access.setup.setup, {
      data: {
        name: 'Admin',
        email: 'setup@ifpr.edu.br',
        password: 'synthetic-password',
        code: 'incorrect',
      },
    }),
    'Código ou e-mail de instalação incorreto.',
    403,
  );
  await rejectsValidation(
    client.action(api.access.setup.setup, {
      data: {
        name: 'Admin',
        email: 'setup@ifpr.edu.br',
        password: 'synthetic-password',
        code: 'synthetic-setup-code',
      },
    }),
    'Conta Admin já criada.',
    409,
  );
  assert.equal((await client.run((ctx) => ctx.db.query('operationalLeases').take(10))).length, 0);
});

test('password sign-in keeps failed-attempt writes while exposing safe credential errors', async () => {
  const { client, ids } = await createNativeFixture();
  const salt = '0123456789abcdef0123456789abcdef';
  await client.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: ids.users['campus-a'],
      provider: 'password',
      providerAccountId: 'a@ifpr.edu.br',
      secret: legacySecret(salt, scryptSync('synthetic-password', salt, 64).toString('hex')),
    }),
  );
  for (const email of ['unknown@ifpr.edu.br', 'a@ifpr.edu.br'])
    await rejectsValidation(
      client.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'signIn', email, password: 'wrong-password' },
      }),
      'E-mail ou senha inválidos.',
      401,
    );
  assert.equal((await client.run((ctx) => ctx.db.query('authRateLimits').take(10))).length, 1);
  for (let i = 0; i < 9; i++)
    await rejectsValidation(
      client.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'wrong-password' },
      }),
      'E-mail ou senha inválidos.',
      401,
    );
  await rejectsValidation(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    'Muitas tentativas. Aguarde antes de tentar novamente.',
    429,
  );
  await rejectsValidation(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    'Solicite seu acesso à administração.',
    403,
  );
});

test('operational validation and maintenance use the shared error contract', async () => {
  const { client } = await createNativeFixture();
  await rejectsValidation(
    client.mutation(internal.operations.pause, { commit: 'invalid' }),
    'Commit de publicação inválido.',
  );
  await client.mutation(internal.operations.pause, { commit: 'a'.repeat(40) });
  await rejectsValidation(
    client.mutation(internal.operations.resume, { commit: 'b'.repeat(40) }),
    'A manutenção não pertence a esta publicação.',
    409,
  );
  await rejectsValidation(
    client.action(api.access.passwordRecovery.requestPasswordRecovery, { email: 'a@ifpr.edu.br' }),
    'Aplicação em manutenção. Aguarde a conclusão e recarregue a página.',
    503,
  );
});

test('presence validation and development setup guards use the shared error contract', async () => {
  const { client, asClient } = await createNativeFixture();
  await rejectsValidation(
    asClient('admin').mutation(api.presence.heartbeat, { tabId: 'invalid' }),
    'Identificador de aba inválido.',
  );
  await rejectsValidation(
    asClient('campus-a').query(api.presence.online, {}),
    'Acesso exclusivo da administração.',
    403,
  );
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://synthetic-dev.convex.cloud');
  await rejectsValidation(
    client.mutation(internal.devSetup.initialize, {
      expectedCloudUrl: 'https://another-dev.convex.cloud',
    }),
    'A inicialização exige o mesmo deployment dev validado pelo dev:setup.',
  );
});

test('unknown authentication responses remain internal errors without exposing provider details', async () => {
  const { client } = await createNativeFixture();
  const { authorize } = await import('../../convex/access/passwordSignIn');
  // Convex-test invokes registered functions through this handler, as the
  // runtime does. Inject an unexpected upstream result at that boundary.
  const registered = authorize as unknown as {
    _handler: () => Promise<{ error: string }>;
  };
  vi.spyOn(registered, '_handler').mockResolvedValue({
    error: 'synthetic private provider detail',
  });
  await assert.rejects(
    client.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'a@ifpr.edu.br', password: 'synthetic-password' },
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error && !(error instanceof ConvexError));
      assert.equal(error.message, 'Resposta de autenticação inválida.');
      return true;
    },
  );
});

test('internal invariants remain ordinary errors', async () => {
  assert.throws(
    () => legacySecret('invalid', 'invalid'),
    (error: unknown) => error instanceof Error && !(error instanceof ConvexError),
  );
  const { client, ids } = await createNativeFixture();
  await client.run((ctx) => ctx.db.delete(ids.users['campus-a']));
  await assert.rejects(
    client.run((ctx) => revokeSessions(ctx, ids.users['campus-a'])),
    (error: unknown) => error instanceof Error && !(error instanceof ConvexError),
  );
});
