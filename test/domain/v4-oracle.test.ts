import { expect, test } from 'vitest';
import type { Doc } from '../../convex/_generated/dataModel';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { v4Cases, writeOracle, type V4Case } from '../helpers/v4-fixtures.ts';
import { expectedOracle, oracleValues, recordedOracle } from '../helpers/v4-oracle.ts';
import { convertedContent, convertedSubmission } from '../helpers/v5-conversion.ts';

/**
 * Oracle “before” of phase 2 (step 1): what the v4 code computes for every frozen document.
 * Later steps rename and convert; these values must stay equal (the conversion steps say which
 * differences they allow). `UPDATE_V4_ORACLE=1` rewrites the file and is only for step 1.
 *
 * From step 5 the stored documents are v4 and the code reads v5: every value is computed over the
 * converted document (`convertContentV5`), except the stored content hashes, which belong to the
 * v4 documents; the hash relation between contents and submissions is checked after conversion.
 * Step 18 computes the same values over the documents the migration stores
 * (`test/convex/v5-migration-proofs.test.ts`).
 */
const cases = v4Cases();
const current = cases.map((item) => oracleValues(item));

if (process.env.UPDATE_V4_ORACLE === '1')
  writeOracle({
    capture: {
      sourceCommit: '43aff30',
      description:
        'Saídas do código v4 sobre test/fixtures/v4/contents.json. O HTML de proensLayout() e o ledger da contagem aparecem por SHA-256; para inspecioná-los, rode o código do commit de captura.',
    },
    cases: current,
  });

const oracle = recordedOracle();

test('the oracle covers every frozen document, in order', () => {
  expect(oracle.cases.map((item) => item.name)).toEqual(cases.map((item) => item.name));
});

test.each(cases.map((item, index) => [item.name, index] as const))(
  'the current code computes the oracle for %s',
  (_name, index) => {
    expect(current[index]).toEqual(expectedOracle(oracle.cases[index]!, cases[index]!));
  },
);

test('submissions keep their stored hash; some equal the current content and one differs', () => {
  const submissions = oracle.cases.flatMap((item) => item.submissions);
  for (const submission of submissions)
    expect(submission.contentHash).toBe(submission.storedContentHash);
  expect(submissions.map((submission) => submission.equalToContent)).toEqual([true, false, true]);
});

test('after conversion, each submission keeps its equality of hash with the current content', () => {
  const hashOf = (content: V4Case['content'] | V4Case['submissions'][number]) =>
    contentHash(content as unknown as Doc<'calendarContents'>);
  const relation = cases.flatMap((item) =>
    item.submissions.map(
      (submission) =>
        hashOf(convertedSubmission(item, submission)) === hashOf(convertedContent(item)),
    ),
  );
  expect(relation).toEqual([true, false, true]);
  // The hash changes with the format, so the migration recalculates it (plan, section 6).
  for (const item of cases) expect(hashOf(convertedContent(item))).not.toBe(hashOf(item.content));
});

test('the oracle records the 21 audited links of section 11 under review', () => {
  const audited = oracle.cases.filter((item) => item.name.endsWith('(seção 11)'));
  expect(
    audited
      .flatMap((item) => Object.values(item.linksToReview))
      .filter((issue) => issue === 'unclassified'),
  ).toHaveLength(21);
});

/**
 * Step 11 (calculated evaluation): coverage and situation above come from `evaluatePlan`; the
 * classification is its new dimension. A date the oracle reviews as `unclassified` is pending for
 * every offer of its scope, a date reviewed for a conflict diverges, and a row diverges only when
 * one of its dates does. No oracle value changes because of it.
 */
test.each(cases.map((item) => [item.name, item] as const))(
  'the classification of %s follows the reviewed links of the oracle',
  (_name, item) => {
    const content = convertedContent(item);
    const state = {
      ...content.state,
      year: item.year,
      campus: item.campus,
    } as unknown as ActivityState;
    const expected = expectedOracle(oracle.cases[cases.indexOf(item)]!, item);
    const { rows, links } = evaluatePlan(state);
    for (const entry of links.byOffer) {
      const issue = (expected.linksToReview as Record<string, string>)[entry.eventId];
      if (issue === 'unclassified') expect(entry.classification).toBe('pending');
      else if (issue) expect(entry.classification).not.toBe('compatible');
      else expect(entry.classification).not.toBe('divergent');
    }
    const linked = state.events.filter((event) => event.activity);
    expect(links.byOffer).toHaveLength(
      linked.reduce((sum, event) => sum + event.scope.offers.length, 0),
    );
    for (const row of rows) {
      const divergent = row.events.some(
        (event) => links.forOffer(event.id, row.offerId) === 'divergent',
      );
      expect(row.classification).toBe(divergent ? 'divergent' : 'compatible');
      // The audited fixtures have no date pending for one offer only; that case is covered in
      // plan-evaluation.test.ts, where such a row is pending and never complete.
      expect(row.events.some((event) => links.forOffer(event.id, row.offerId) === 'pending')).toBe(
        false,
      );
    }
  },
);
