import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Doc } from '../../convex/_generated/dataModel';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import {
  activitySituation,
  evaluatePlan,
} from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { inspect, type BaseDocument } from '../../src/domain/calendar/base.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  projectDates,
  type ActivityState,
  type InstitutionalEventSnapshot,
} from '../../src/domain/calendar/model.ts';
import { applyObservances } from '../../src/domain/calendar/observances.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import { datesLinkedToLegacyRows, legacyIds } from './legacy-classification.ts';
import { readOracle, type V4Case, type V4Content } from './v4-fixtures.ts';
import { convertedContent } from './v5-conversion.ts';

/**
 * Oracle “before” of phase 2 (step 1 of `docs/plans/2026-11-02-atividades-e-datas.md`): what the
 * v4 code computed for every frozen document, recorded in `test/fixtures/v4/oracle-before.json`.
 * `oracleValues` computes the same values with the current code over a document in format 5 (by
 * default the pure conversion of the frozen one; the migration tests pass the document the
 * migration stored), and `expectedOracle` gives what the recorded oracle expects of it.
 *
 * The content hashes are those of the stored v4 documents (`item`): the hash changes with the
 * format, and the relation between contents and submissions is checked after conversion.
 */
const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function oracleValues(item: V4Case, content: V4Content = convertedContent(item)) {
  const state = {
    ...content.state,
    year: item.year,
    campus: item.campus,
  } as unknown as ActivityState & { rulesetVersion?: string };
  const snapshot = content.institutionalSnapshot as unknown as InstitutionalEventSnapshot[];
  // Step 4 (origin by container): the editor projection must keep every oracle value.
  const events = projectDates(applyObservances(snapshot, state), state.events);
  let evaluation: ReturnType<typeof evaluateCalendar> | null = null;
  let countingError: string | undefined;
  try {
    evaluation = evaluateCalendar(state, events);
  } catch (error) {
    countingError = error instanceof Error ? error.message : String(error);
  }
  const coverage = evaluatePlan(state).rows;
  const base = {
    revision: content.catalogueRevision,
    events: snapshot,
    documents: content.documentSnapshot as unknown as BaseDocument[],
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
    // Step 9b: each row also carries its link (`activity`), checked against the rows below.
    activities: activityPlan(state).map(({ activity: _link, ...row }) => row),
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
        activitySituation(coverage.filter((row) => row.requirement.id === id)),
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

export type OracleCase = ReturnType<typeof oracleValues>;

export const recordedOracle = () => readOracle<{ cases: OracleCase[] }>();

/**
 * The oracle as the code computes it from step 9d: without the 2027 rows of “Classificação
 * legada”, their coverage and their situation, and with each date linked to one of them under
 * review as `unclassified` (the pending classification the conversion adds). Every other value is
 * the recorded one.
 */
export function expectedOracle(expected: OracleCase, item: V4Case): OracleCase {
  const ids = legacyIds(expected.activities);
  const linked = datesLinkedToLegacyRows(item.content.state.events, ids);
  return {
    ...expected,
    linksToReview: {
      ...Object.fromEntries(linked.map((id) => [id, 'unclassified'])),
      ...expected.linksToReview,
    },
    activities: expected.activities.filter((row) => !ids.has(row.id)),
    coverage: expected.coverage.filter((row) => !ids.has(row.activity)),
    status: Object.fromEntries(Object.entries(expected.status).filter(([id]) => !ids.has(id))),
  };
}
