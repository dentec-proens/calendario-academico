import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/database.mjs';

test('experimental login and logout keep baseline cookies separate on the same host', async (t) => {
  const app = await createTestApp(t, {
    setupCode: 'synthetic',
    sessionCookieName: 'dentec_convex_lab_session',
    googleCookieName: 'dentec_convex_lab_google',
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const call = (path, body, cookie = '') =>
    fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Dentec-Request': '1', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
  assert.equal(
    (
      await call('/api/setup', {
        code: 'synthetic',
        email: 'lab-cookie@ifpr.edu.br',
        name: 'Teste de isolamento',
        password: 'synthetic-password',
      })
    ).status,
    201,
  );
  const login = await call('/api/login', {
    email: 'lab-cookie@ifpr.edu.br',
    password: 'synthetic-password',
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^dentec_convex_lab_session=/);
  assert.equal((await call('/api/bootstrap', null, cookie)).status, 200);
  assert.equal(
    (
      await call(
        '/api/bootstrap',
        null,
        cookie.replace('dentec_convex_lab_session=', 'dentec_session='),
      )
    ).status,
    401,
  );
  const combined = 'dentec_session=baseline-token; ' + cookie;
  assert.equal((await call('/api/bootstrap', null, combined)).status, 200);
  const logout = await call('/api/logout', {}, combined);
  assert.match(logout.headers.get('set-cookie'), /^dentec_convex_lab_session=;/);
  assert.doesNotMatch(logout.headers.get('set-cookie'), /^dentec_session=/);
});
