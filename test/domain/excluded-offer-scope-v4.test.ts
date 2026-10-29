import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { convertCalendarV3 } from '../../src/domain/calendar/normalization/conversion-v4.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

const oracle = JSON.parse(
  readFileSync(new URL('../fixtures/offers-v3-oracle.json', import.meta.url), 'utf8'),
) as { cases: { name: string; input: ActivityState }[] };
const source = oracle.cases.find(
  (row) =>
    row.input.year === 2027 &&
    row.input.modalities?.length === 1 &&
    row.input.modalities[0] === 'posgraduacao',
)!.input;
const readiness = (state: ActivityState) =>
  releaseReadiness(
    { id: 'synthetic', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state },
    { catalogue: { revision: 1 }, reviews: [] },
  );

for (const status of [undefined, 'covered', 'own-regulation'] as const) {
  test(`excludes postgraduate scope confirmation without dropping other findings (${String(status)})`, () => {
    const before = {
      ...structuredClone(source),
      scopeConfirmation: status ? { status } : undefined,
    };
    const converted = convertCalendarV3(before, { year: 2027, modalities: ['posgraduacao'] });
    expect(converted.offers[0]).not.toHaveProperty('scope');
    const actual = readiness({ ...converted, year: 2027 });
    const previous = readiness(before);
    const obsolete = policyFor(2027).scope!.readinessIssue;
    expect(actual).toEqual({
      ...previous,
      issues: previous.issues.filter((issue) => issue !== obsolete),
    });
  });
}

test('excluded offers do not waive confirmation for a covered kind in a mixed calendar', () => {
  const before = {
    ...structuredClone(source),
    modalities: ['graduacao', 'posgraduacao'],
    organizationByModality: { graduacao: 'anual' as const, posgraduacao: 'anual' as const },
    assessmentStagesByModality: {},
  };
  const content = convertCalendarV3(
    { ...before, scopeConfirmation: undefined },
    { year: 2027, modalities: before.modalities },
  );
  const state = { ...content, year: 2027 };
  expect(readiness(state).issues).toContain(policyFor(2027).scope!.readinessIssue);
  state.offers[0].scope = { status: 'covered' };
  expect(readiness(state).issues).not.toContain(policyFor(2027).scope!.readinessIssue);
  state.offers[0].scope = { status: 'own-regulation' };
  expect(readiness(state).issues).toContain(policyFor(2027).scope!.readinessIssue);
});
