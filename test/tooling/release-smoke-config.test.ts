import { test, expect } from 'vitest';
import { releaseSmokeConfiguration } from '../../scripts/release-smoke-config.ts';
import { environments } from '../../config/environments.ts';
const environment = {
  DENTEC_RELEASE_SMOKE_CALENDAR_ID: 'test-calendar',
  DENTEC_RELEASE_SMOKE_USER_ID: 'test-user',
  DENTEC_RELEASE_SMOKE_EMAIL: 'test@example.com',
  DENTEC_RELEASE_SMOKE_PASSWORD: 'synthetic-password',
};
test('candidate uses production backend and origin-scoped OIDC configuration', () => {
  const value = releaseSmokeConfiguration({
    ...environment,
    DENTEC_RELEASE_CANDIDATE_URL: 'https://candidate.vercel.app',
    VERCEL_OIDC_TOKEN: 'synthetic-oidc',
  });
  expect(value.portalUrl).toBe(environments.production.portalUrl);
  expect(value).toHaveProperty('deploymentUrl', 'https://candidate.vercel.app');
  expect(value.backendUrl).toBe(environments.production.url);
  expect(value.protection).toEqual({
    name: 'x-vercel-trusted-oidc-idp-token',
    value: 'synthetic-oidc',
  });
  expect(releaseSmokeConfiguration(environment).protection).toBeUndefined();
});
test.each([
  'http://candidate.vercel.app',
  'https://candidate.vercel.app/other',
  'https://candidate.vercel.app.evil.example',
  'https://user:pass@candidate.vercel.app',
])('rejects candidate URL %s', (url) => {
  expect(() =>
    releaseSmokeConfiguration({ ...environment, DENTEC_RELEASE_CANDIDATE_URL: url }),
  ).toThrow(/URL imutável/);
});
