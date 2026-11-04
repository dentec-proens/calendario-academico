import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { policyFor } from '../../src/domain/policies/registry.ts';
import {
  expectedCatalogue,
  formatExpected,
  referenceSettings,
  type ExpectedCatalogues,
} from '../helpers/catalogue-reference.ts';

/**
 * Expected catalogue of 2027 and of 2028 (without a norm), over every reference configuration
 * (`test/fixtures/catalogue-expected.json`): the criteria, the excluded offers and, per
 * configuration, the window and each expanded row with its applicability, note and minimums by
 * offer. It is the readable counterpart of the version fingerprint in `ruleset-history.test.ts`:
 * when a rule changes, this is where the review sees which rows, applicabilities and minimums
 * changed.
 *
 * The file changes only through `UPDATE_CATALOGUE_EXPECTED=1`, which rewrites it from the current
 * code. Use it for a change that is meant to alter the catalogue, and declare in the commit which
 * rows, applicabilities and coverages could change; review the diff of the fixture against that
 * declaration before committing, since the regeneration accepts whatever the code produces.
 */
const file = new URL('../fixtures/catalogue-expected.json', import.meta.url);
const years = [2027, 2028];

const current: ExpectedCatalogues = Object.fromEntries(
  years.map((year) => [String(year), expectedCatalogue(policyFor(year), year)]),
);

if (process.env.UPDATE_CATALOGUE_EXPECTED === '1') writeFileSync(file, formatExpected(current));

const expected = JSON.parse(readFileSync(file, 'utf8')) as ExpectedCatalogues;

test.each(years)('the code generates the expected catalogue of %i', (year) => {
  const want = expected[String(year)];
  const have = current[String(year)];
  expect(have.criteria).toEqual(want.criteria);
  expect(have.excludedModalities).toEqual(want.excludedModalities);
  expect(want.states.map((state) => state.offers)).toEqual(
    referenceSettings.map((settings) => settings.offers),
  );
  // Row by row, so a failure names the configuration and the activity that changed.
  for (const [index, state] of have.states.entries()) {
    const label = `${year}, configuração ${index + 1}`;
    expect(state.window, label).toEqual(want.states[index].window);
    expect(
      state.requirements.map((row) => row.id),
      label,
    ).toEqual(want.states[index].requirements.map((row) => row.id));
    for (const [position, row] of state.requirements.entries())
      expect(row, `${label}: ${row.id}`).toEqual(want.states[index].requirements[position]);
  }
});

test('the fixture holds only the years it is compared with', () => {
  expect(Object.keys(expected).sort()).toEqual(years.map(String));
});

test('the expected catalogue has no row of the retired “Classificação legada”', () => {
  // 2027 generates only its own declarations; the optional rows the operational catalogue once
  // lent it left the policy with format 4.
  for (const state of expected['2027'].states)
    expect(
      state.requirements.filter(
        (row) => (row as { basis?: string }).basis === 'Classificação legada',
      ),
    ).toEqual([]);
});
