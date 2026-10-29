import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/offers-v4-oracle-inputs.json', import.meta.url), 'utf8'),
) as { cases: { name: string; input: ActivityState }[] };
const source = fixture.cases.find(
  (row) =>
    row.input.year === 2027 &&
    row.input.offers.length === 1 &&
    row.input.offers[0].kind === 'posgraduacao',
)!.input;
const readiness = (state: ActivityState) =>
  releaseReadiness(
    { id: 'synthetic', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state },
    { catalogue: { revision: 1 }, reviews: [] },
  );
for (const status of [undefined, 'covered', 'own-regulation'] as const)
  test(`postgraduate scope does not suppress other findings (${String(status)})`, () => {
    const baseline = structuredClone(source),
      state = structuredClone(source);
    state.offers[0].scope = status ? { status } : undefined;
    expect(readiness(state)).toEqual(readiness(baseline));
    expect(readiness(state).issues).not.toContain(policyFor(2027).scope!.readinessIssue);
  });

test('excluded offers do not waive confirmation for a covered kind in a mixed calendar', () => {
  const state = {
    ...structuredClone(source),
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
      ...structuredClone(source.offers),
    ],
  };
  expect(readiness(state).issues).toContain(policyFor(2027).scope!.readinessIssue);
  state.offers[0].scope = { status: 'covered' };
  expect(readiness(state).issues).not.toContain(policyFor(2027).scope!.readinessIssue);
  state.offers[0].scope = { status: 'own-regulation' };
  expect(readiness(state).issues).toContain(policyFor(2027).scope!.readinessIssue);
});
