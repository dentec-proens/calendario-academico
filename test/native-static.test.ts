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
  await writeFile(join(directory, 'portal.html'), 'react portal alias');
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
    assert.equal(await (await fetch(origin + '/index.html')).text(), 'react portal root');
    assert.equal(await (await fetch(origin + '/portal')).text(), 'react portal alias');
    assert.equal(await (await fetch(origin + '/editor?id=fixture')).text(), 'calendar editor');
    assert.equal(await (await fetch(origin + '/editor.html')).text(), 'calendar editor');
    assert.equal(await (await fetch(origin + '/ativar')).text(), 'convex invitation');
    assert.equal((await fetch(origin + '/api/status')).status, 404);
    assert.equal((await fetch(origin + '/api/login', { method: 'POST' })).status, 404);
    assert.equal((await fetch(origin + '/.env.convex.local')).status, 404);
    assert.equal((await fetch(origin + '/%2e%2e%2fpackage.json')).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
