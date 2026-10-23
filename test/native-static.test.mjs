import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { nativeStatic } from '../src/native-static.mjs';

test('native server serves portal and invitation routes without a Node API or environment access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-static-'));
  await writeFile(join(directory, 'portal.html'), 'react portal');
  await writeFile(join(directory, 'activate.html'), 'convex invitation');
  const server = http.createServer(nativeStatic(directory));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal(await (await fetch(origin)).text(), 'react portal');
    assert.equal(await (await fetch(origin + '/ativar')).text(), 'convex invitation');
    assert.equal((await fetch(origin + '/api/status')).status, 404);
    assert.equal((await fetch(origin + '/api/login', { method: 'POST' })).status, 404);
    assert.equal((await fetch(origin + '/.env.convex.local')).status, 404);
    assert.equal((await fetch(origin + '/%2e%2e%2fpackage.json')).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
