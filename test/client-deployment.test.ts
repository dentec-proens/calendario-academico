import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validatePortalDeploymentUrl } from '../config/client-deployment.ts';

test('the portal accepts cloud deployments and requires explicit disposable opt-in for loopback', () => {
  assert.doesNotThrow(() => validatePortalDeploymentUrl('https://fixture.convex.cloud', {}));
  assert.throws(() => validatePortalDeploymentUrl('http://127.0.0.1:3220', {}));
  assert.doesNotThrow(() =>
    validatePortalDeploymentUrl('http://127.0.0.1:3220', { DENTEC_DISPOSABLE_E2E: '1' }),
  );
  assert.throws(() =>
    validatePortalDeploymentUrl('http://127.0.0.1:3220', {
      DENTEC_DISPOSABLE_E2E: '1',
      VERCEL_ENV: 'production',
    }),
  );
});

test('disposable builds reject remote HTTP, malformed ports and non-loopback targets', () => {
  for (const url of [
    'http://localhost:3220',
    'http://0.0.0.0:3220',
    'http://192.168.1.1:3220',
    'http://127.0.0.1:0',
    'http://127.0.0.1:65536',
    'http://127.0.0.1:3220/path',
    'http://127.0.0.1:3220/',
    'https://127.0.0.1:3220',
    'http://fixture.convex.cloud',
  ])
    assert.throws(() => validatePortalDeploymentUrl(url, { DENTEC_DISPOSABLE_E2E: '1' }), url);
});
