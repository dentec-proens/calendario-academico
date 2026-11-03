import { expect, test } from 'vitest';
import { storedCases } from '../helpers/stored-fixtures.ts';
import { oracleValues, recordedOracle, writeOracle } from '../helpers/stored-oracle.ts';

/**
 * Regression oracle of the stored format 5 documents (`test/fixtures/stored/oracle.json`): the
 * counting, coverage, base identity, print layout and breakdown the domain computes for each of
 * them must stay equal. `UPDATE_STORED_ORACLE=1` rewrites the file; use it only for a change that
 * is meant to alter these results, and say which values changed and why in the commit.
 */
const cases = storedCases();
const current = cases.map((item) => oracleValues(item));

if (process.env.UPDATE_STORED_ORACLE === '1')
  writeOracle({
    capture: {
      description:
        'Saídas do código do formato 5 sobre test/fixtures/stored/contents.json. Na gravação, todos os valores exceto os hashes de conteúdo foram conferidos iguais aos que o oráculo do formato 4 (test/fixtures/v4/oracle-before.json, removido na contração; ver bd9826b) esperava dos documentos convertidos. O HTML de proensLayout() e o ledger da contagem aparecem por SHA-256.',
    },
    cases: current,
  });

const oracle = recordedOracle();

test('the oracle covers every stored document, in order', () => {
  expect(oracle.cases.map((item) => item.name)).toEqual(cases.map((item) => item.name));
});

test.each(cases.map((item, index) => [item.name, index] as const))(
  'the current code computes the oracle for %s',
  (_name, index) => {
    expect(current[index]).toEqual(oracle.cases[index]);
  },
);

test('each stored submission keeps its hash and its relation to the current content', () => {
  const submissions = current.flatMap((item) => item.submissions);
  for (const submission of submissions)
    expect(submission.contentHash).toBe(submission.storedContentHash);
  expect(submissions.map((submission) => submission.equalToContent)).toEqual([true, false, true]);
});
