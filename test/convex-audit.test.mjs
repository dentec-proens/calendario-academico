import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFunctionReference } from 'convex/server';
import { createConvexTestDatabase } from './helpers/convex-database.mjs';
import { createTestApp } from './helpers/database.mjs';
import { authorizeGoogleUser } from '../src/google-auth.mjs';
import { requestRecovery } from '../src/password-recovery.mjs';

test('more than 1000 audit entries preserve normal API operations and indexed campus log pages', async (t) => {
  const database = await createConvexTestDatabase(t);
  const app = await createTestApp(t, { store: database.store, setupCode: 'synthetic-audit' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  async function call(path, body, cookie = '') {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Dentec-Request': '1',
        Cookie: cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }

  await call('/api/setup', {
    code: 'synthetic-audit',
    name: 'Synthetic audit administrator',
    email: 'audit-admin@ifpr.edu.br',
    password: 'synthetic-only-password',
  });
  const admin = (
    await call('/api/login', {
      email: 'audit-admin@ifpr.edu.br',
      password: 'synthetic-only-password',
    })
  ).cookie;
  const bootstrap = (await call('/api/bootstrap', null, admin)).data;
  const [campus, other] = bootstrap.campuses;
  await call(
    '/api/users',
    {
      name: 'Synthetic campus member',
      email: 'audit-campus@ifpr.edu.br',
      password: 'synthetic-only-password',
      campusId: campus.id,
    },
    admin,
  );
  const member = (
    await call('/api/login', {
      email: 'audit-campus@ifpr.edu.br',
      password: 'synthetic-only-password',
    })
  ).cookie;
  const calendarInput = {
    purpose: 'test',
    courses: 'Synthetic audit course',
    year: 2027,
    offer: 'integrado',
    regime: 'anual',
  };
  const calendar = (await call('/api/calendars', { ...calendarInput, campusId: campus.id }, member))
    .data;
  const foreign = (await call('/api/calendars', { ...calendarInput, campusId: other.id }, admin))
    .data;
  const history = (
    await call(
      '/api/calendars/' + calendar.id + '/history',
      {
        filename: 'synthetic.pdf',
        year: 2026,
        notes: 'Synthetic audit fixture',
        data: Buffer.from('%PDF-1.4 synthetic').toString('base64'),
      },
      member,
    )
  ).data;
  const before = await database.store.read({ fields: ['users'] });
  const actor = before.users.find((user) => user.email === 'audit-campus@ifpr.edu.br').id;
  for (let start = 1; start <= 1105; start += 300) {
    await database.store.change(
      (db) => {
        for (let version = start; version < Math.min(start + 300, 1106); version++)
          db.audit.push({
            id: calendar.id,
            action: 'SAVE_CALENDAR',
            actor,
            at: '2026-10-23T12:00:00.000Z',
            version,
          });
      },
      { fields: ['audit'], appendOnlyAudit: true },
    );
  }
  await database.store.change(
    (db) => {
      db.audit.push(
        { id: foreign.id, action: 'SAVE_CALENDAR', actor, version: 9999 },
        { id: actor, action: 'CREATE_USER', actor, campusId: campus.id },
        { id: history.id, action: 'ANALYZE_HISTORY', actor, version: 7777 },
      );
    },
    { fields: ['audit'], appendOnlyAudit: true },
  );
  const first = await call('/api/logs', null, member);
  assert.equal(first.status, 200);
  assert.equal(first.data.entries.length, 100);
  assert.equal(first.data.nextOffset, 100);
  assert.equal(first.data.entries[0].version, 7777);
  assert.equal(first.data.entries[0].action, 'Calendário anterior analisado');
  assert.equal(first.data.entries[0].actor, 'Synthetic campus member');
  assert(first.data.entries.every((entry) => entry.calendar === first.data.entries[0].calendar));
  assert(!first.data.entries.some((entry) => entry.version === 9999));
  assert(!first.data.entries.some((entry) => entry.action === 'Membro cadastrado'));
  const second = await call('/api/logs?offset=100', null, member);
  assert.equal(second.status, 200);
  assert.equal(second.data.entries.length, 100);
  assert.equal(second.data.entries[0].version, 1006);
  assert.equal(second.data.nextOffset, 200);
  const adminLog = await call('/api/logs', null, admin);
  assert.equal(adminLog.status, 200);
  assert.equal(adminLog.data.entries[1].action, 'Membro cadastrado');
  assert.equal(adminLog.data.entries[2].version, 9999);
  const tail = await call('/api/logs?offset=1100', null, member);
  assert.equal(tail.status, 200);
  assert.equal(tail.data.nextOffset, null);
  assert(tail.data.entries.length > 0 && tail.data.entries.length < 100);
  const outOfRange = await call('/api/logs?offset=8100', null, admin);
  assert.equal(outOfRange.status, 400);
  assert.match(outOfRange.data.error, /8\.000/);
  await assert.rejects(
    database.client.query(makeFunctionReference('audit:page'), {
      secret: 'incorrect',
      role: 'ADMIN',
      campusId: null,
      offset: 0,
    }),
  );
  assert.equal(
    (
      await call('/api/login', {
        email: 'audit-admin@ifpr.edu.br',
        password: 'synthetic-only-password',
      })
    ).status,
    200,
  );
  assert.equal((await call('/api/bootstrap', null, member)).status, 200);
  assert.equal(
    (await call('/api/calendars', { ...calendarInput, campusId: campus.id }, member)).status,
    201,
  );
  assert.equal(
    (
      await call(
        '/api/documents',
        {
          filename: 'synthetic.pdf',
          year: 2028,
          type: 'norma',
          title: 'Synthetic document after 1000 audit entries',
          source: 'Synthetic test only',
          data: Buffer.from('%PDF-1.4 synthetic').toString('base64'),
        },
        admin,
      )
    ).status,
    201,
  );
  assert.equal((await call('/api/logs?offset=100', null, admin)).status, 200);
  const googleUser = await authorizeGoogleUser(database.store, {
    email: 'audit-campus@ifpr.edu.br',
    subject: 'synthetic-google-subject',
  });
  assert.equal(googleUser.id, actor);
  let recovery;
  await requestRecovery(database.store, 'audit-admin@ifpr.edu.br', base, async (message) => {
    recovery = message;
  });
  assert.equal(recovery.to, 'audit-admin@ifpr.edu.br');
  const deliveryLog = t.mock.method(console, 'error', () => {});
  await requestRecovery(database.store, 'audit-admin@ifpr.edu.br', base, async () => {
    throw Error('Synthetic delivery outage');
  });
  assert.equal(deliveryLog.mock.callCount(), 1);
  assert.equal(
    (await database.store.read({ fields: ['passwordResets'] })).passwordResets.length,
    1,
  );
  const token = new URL(recovery.url).hash.split('=')[1];
  assert.equal(
    (await call('/api/password/reset', { token, password: 'synthetic-new-password' })).status,
    200,
  );
  assert.equal(
    (
      await call('/api/login', {
        email: 'audit-admin@ifpr.edu.br',
        password: 'synthetic-new-password',
      })
    ).status,
    200,
  );
});
