import { readFileSync, writeFileSync } from 'node:fs';
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
import type { StoredCase, StoredContent, StoredSubmission } from './stored-fixtures.ts';

/**
 * Oracle of the stored format 5 documents (`test/fixtures/stored/oracle.json`): what the domain
 * computes for each document of `test/fixtures/stored/contents.json` (counting with the ledger by
 * SHA-256, coverage, situation, activities, links under review, base identity, the PROENS print
 * by SHA-256 and the teaching-day breakdown), plus the content hash of each document and of each
 * submission. It replaces the phase 2 oracle of format 4, removed with the converter in the
 * contraction: when recorded, every value except the hashes was checked equal to what that oracle
 * expected of the converted documents.
 */
const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hashOf = (content: StoredContent | StoredSubmission) =>
  contentHash(content as unknown as Doc<'calendarContents'>);

export function oracleValues(item: StoredCase) {
  const { content } = item;
  const state = {
    ...content.state,
    year: item.year,
    campus: item.campus,
  } as unknown as ActivityState & { rulesetVersion?: string };
  const snapshot = content.institutionalSnapshot as unknown as InstitutionalEventSnapshot[];
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
  return plain({
    name: item.name,
    contentHash: hashOf(content),
    submissions: item.submissions.map((submission) => ({
      sequence: submission.sequence,
      contentHash: hashOf(submission),
      storedContentHash: submission.contentHash,
      equalToContent: hashOf(submission) === hashOf(content),
    })),
    baseIdentity: inspect(base, base, state).identity,
    linksToReview: Object.fromEntries(linksToReview(state)),
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

const file = new URL('../fixtures/stored/oracle.json', import.meta.url);

export const recordedOracle = () =>
  JSON.parse(readFileSync(file, 'utf8')) as { capture: unknown; cases: OracleCase[] };

export function writeOracle(value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
