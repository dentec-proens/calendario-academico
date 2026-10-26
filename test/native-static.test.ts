import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { staticPortal as nativeStatic } from '../src/app-server.ts';

test('native server serves portal and invitation routes without a Node API or environment access', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'native-static-'));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'index.html'), 'react portal root');
  await writeFile(join(directory, 'portal.html'), 'react portal application');
  await writeFile(join(directory, 'editor.html'), 'calendar editor');
  await writeFile(join(directory, 'activate.html'), 'convex invitation');
  const server = http.createServer(nativeStatic(directory));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const origin = 'http://127.0.0.1:' + address.port;
  try {
    assert.equal(await (await fetch(origin)).text(), 'react portal root');
    for (const route of [
      '/calendarios',
      '/calendarios/novo',
      '/documentos/novo?ano=2027',
      '/eventos-institucionais',
      '/eventos-institucionais/event-a/editar',
      '/campi/novo',
      '/contas/nova',
      '/usuarios-online',
      '/revisoes/calendar-a',
    ]) {
      assert.equal(await (await fetch(origin + route)).text(), 'react portal root', route);
    }
    for (const section of [
      'editar',
      'periodos',
      'avaliacoes',
      'dias',
      'ferias',
      'eventos',
      'historico',
      'pendencias',
      'visualizar',
    ]) {
      const route = `/calendarios/calendar-a/${section}`;
      assert.equal(await (await fetch(origin + route)).text(), 'react portal root', route);
      const head = await fetch(origin + route, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }
    assert.equal(await (await fetch(origin + '/ativar-conta')).text(), 'react portal root');
    assert.equal((await fetch(origin + '/api/status')).status, 404);
    assert.equal((await fetch(origin + '/api/login', { method: 'POST' })).status, 404);
    assert.equal((await fetch(origin + '/.env.convex.local')).status, 404);
    assert.equal((await fetch(origin + '/%2e%2e%2fpackage.json')).status, 404);
    for (const path of [
      '/portal',
      '/editor?id=fixture',
      '/ativar',
      '/calendarios/calendar-a/desconhecido',
      '/calendarios/novo/editar/extra',
      '/revisoes/id/extra',
      '/assets/inexistente.js',
      '/calendarios/%2F/editar',
      '/calendarios/%ZZ/editar',
    ]) {
      assert.equal((await fetch(origin + path)).status, 404, path);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
