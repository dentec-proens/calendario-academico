import { expect, test } from 'vitest';
import { storedCases } from '../helpers/stored-fixtures.ts';
import { oracleValues, recordedOracle, writeOracle } from '../helpers/stored-oracle.ts';

/**
 * Regression oracle of the stored documents (`test/fixtures/stored/oracle.json`): the counting,
 * the coverage with dates, issues or warnings, the base identity, the print layout and the
 * breakdown the domain computes for each of them must stay equal. `UPDATE_STORED_ORACLE=1`
 * rewrites the file (format it afterwards with `prettier --write`, as the repository checks it);
 * use it only for a change that is meant to alter these results, and say which values changed and
 * why in the commit.
 */
const cases = storedCases();
const current = cases.map((item) => oracleValues(item));

if (process.env.UPDATE_STORED_ORACLE === '1')
  writeOracle({
    capture: {
      description:
        'Saídas do código sobre test/fixtures/stored/contents.json, com toda oferta organizada. A cobertura só tem as linhas com datas vinculadas, pendências ou avisos, e a lista de atividades não é gravada: o que o catálogo decide está em test/fixtures/catalogue-expected.json. Na primeira gravação, sobre o formato 5, todos os valores exceto os hashes de conteúdo foram conferidos iguais aos que o oráculo do formato 4 (test/fixtures/v4/oracle-before.json, removido na contração; ver bd9826b) esperava dos documentos convertidos; as diferenças de cada regravação estão na mensagem do commit. O HTML de proensLayout() e o ledger da contagem aparecem por SHA-256.',
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
