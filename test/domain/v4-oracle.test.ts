import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, test } from 'vitest';
import type { Doc } from '../../convex/_generated/dataModel';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { activityStatus } from '../../src/domain/calendar/activities/status.ts';
import { inspect, type BaseDocument, type BaseEvent } from '../../src/domain/calendar/base.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { applyObservances } from '../../src/domain/calendar/observances.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import { readOracle, v4Cases, writeOracle, type V4Case } from '../helpers/v4-fixtures.ts';

/**
 * Oracle “before” of phase 2 (step 1): what the v4 code computes for every frozen document.
 * Later steps rename and convert; these values must stay equal (the conversion steps say which
 * differences they allow). `UPDATE_V4_ORACLE=1` rewrites the file and is only for step 1.
 */
const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function before(item: V4Case) {
  const state = {
    ...item.content.state,
    year: item.year,
    campus: item.campus,
  } as unknown as ActivityState & { rulesetVersion?: string };
  const snapshot = item.content.institutionalSnapshot as unknown as BaseEvent[];
  const events = [...applyObservances(snapshot, state), ...state.events];
  let evaluation: ReturnType<typeof evaluateCalendar> | null = null;
  let countingError: string | undefined;
  try {
    evaluation = evaluateCalendar(state, events);
  } catch (error) {
    countingError = error instanceof Error ? error.message : String(error);
  }
  const coverage = activityCoverage(state);
  const base = {
    revision: item.content.catalogueRevision,
    events: snapshot,
    documents: item.content.documentSnapshot as unknown as BaseDocument[],
    rulesetVersion: state.rulesetVersion,
  };
  const html = proensLayout(state, events, evaluation, null, '');
  const stored = (content: V4Case['content'] | V4Case['submissions'][number]) =>
    contentHash(content as unknown as Doc<'calendarContents'>);
  return plain({
    name: item.name,
    contentHash: stored(item.content),
    submissions: item.submissions.map((submission) => ({
      sequence: submission.sequence,
      contentHash: stored(submission),
      storedContentHash: submission.contentHash,
      equalToContent: stored(submission) === stored(item.content),
    })),
    baseIdentity: inspect(base, base, state).identity,
    linksToReview: Object.fromEntries(linksToReview(state)),
    activities: activityChecklist(state),
    coverage: coverage.map((row) => ({
      activity: row.requirement.id,
      offerId: row.offerId,
      applicability: row.applicability,
      coverage: row.coverage,
      humanReview: row.humanReview,
      execution: row.execution,
      events: row.events.map((event) => event.id),
      issues: row.issues,
      warnings: row.warnings,
    })),
    status: Object.fromEntries(
      [...new Set(coverage.map((row) => row.requirement.id))].map((id) => [
        id,
        activityStatus(coverage.filter((row) => row.requirement.id === id)),
      ]),
    ),
    counting: evaluation
      ? Object.fromEntries(
          Object.entries(evaluation.byOffer).map(([offerId, { ledger, ...count }]) => [
            offerId,
            { ...count, ledgerSha256: hash(JSON.stringify(ledger)) },
          ]),
        )
      : { error: countingError },
    teachingDayBreakdown: evaluation
      ? Object.fromEntries(
          state.offers.map((offer) => [
            offer.id,
            teachingDayBreakdown(state, events, evaluation, offer.id),
          ]),
        )
      : null,
    proensLayout: { length: html.length, sha256: hash(html) },
  });
}

const cases = v4Cases();
const current = cases.map(before);

if (process.env.UPDATE_V4_ORACLE === '1')
  writeOracle({
    capture: {
      sourceCommit: '43aff30',
      description:
        'Saídas do código v4 sobre test/fixtures/v4/contents.json. O HTML de proensLayout() e o ledger da contagem aparecem por SHA-256; para inspecioná-los, rode o código do commit de captura.',
    },
    cases: current,
  });

const oracle = readOracle<{ cases: ReturnType<typeof before>[] }>();

test('the oracle covers every frozen document, in order', () => {
  expect(oracle.cases.map((item) => item.name)).toEqual(cases.map((item) => item.name));
});

test.each(cases.map((item, index) => [item.name, index] as const))(
  'v4 code still computes the oracle for %s',
  (_name, index) => {
    expect(current[index]).toEqual(oracle.cases[index]);
  },
);

test('submissions keep their stored hash; some equal the current content and one differs', () => {
  const submissions = oracle.cases.flatMap((item) => item.submissions);
  for (const submission of submissions)
    expect(submission.contentHash).toBe(submission.storedContentHash);
  expect(submissions.map((submission) => submission.equalToContent)).toEqual([true, false, true]);
});

test('the oracle records the 21 audited links of section 11 under review', () => {
  const audited = oracle.cases.filter((item) => item.name.endsWith('(seção 11)'));
  expect(
    audited
      .flatMap((item) => Object.values(item.linksToReview))
      .filter((issue) => issue === 'unclassified'),
  ).toHaveLength(21);
});
