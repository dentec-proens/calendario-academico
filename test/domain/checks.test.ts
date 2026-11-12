import { expect, test } from 'vitest';
import { blocks, checks } from '../../src/domain/calendar/checks.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { contentAssessment, type ContentIssue } from '../../src/domain/calendar/readiness.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import {
  cascavelDraft,
  conflictingLinks,
  ivaiporaDraft,
  stageLinksToReview,
} from '../fixtures/pending-links-2027.ts';
import { storedCases } from '../helpers/stored-fixtures.ts';

const drafts = [
  ['several undergraduate offers', calendarOffersFixture],
  ['Ivaiporã', ivaiporaDraft],
  ['Cascavel', cascavelDraft],
  ['links in conflict', conflictingLinks],
  ['stage links to review', stageLinksToReview],
] as const;

const findings = (state: Parameters<typeof contentAssessment>[0]['state']): ContentIssue[] => {
  const { issues, notes } = contentAssessment({ state, institutionalSnapshot: [] });
  return [...issues, ...notes];
};

test.each(drafts)(
  'every finding of %s names a registered check and keys it without text',
  (_, draft) => {
    const all = findings(draft());
    expect(all.length).toBeGreaterThan(0);
    for (const item of all) {
      expect(Object.keys(checks)).toContain(item.check);
      // Identifiers have no spaces; any sentence of a message does.
      expect(item.key).not.toMatch(/\s/);
    }
  },
);

test('the stored documents key every finding without text', () => {
  for (const item of storedCases()) {
    const state = { ...item.content.state, year: item.year, campus: item.campus } as never;
    const institutionalSnapshot = item.content.institutionalSnapshot as never;
    const { issues, notes } = contentAssessment({ state, institutionalSnapshot });
    for (const finding of [...issues, ...notes])
      expect(finding.key, `${item.name}: ${finding.message}`).not.toMatch(/\s/);
  }
});

test.each(drafts)('what %s may not submit is exactly what its checks block', (_, draft) => {
  const { issues, notes } = contentAssessment({ state: draft(), institutionalSnapshot: [] });
  expect(issues.every((item) => blocks(item.check).submit)).toBe(true);
  expect(notes.some((item) => blocks(item.check).submit)).toBe(false);
});

test.each(drafts)('the activity rows of %s agree with the registry', (_, draft) => {
  for (const row of evaluatePlan(draft()).rows) {
    // What keeps an activity from being complete is always something to correct…
    for (const item of row.issues) expect(blocks(item.check).submit, item.check).toBe(true);
    // …and what the row only explains or leaves to the review never is.
    for (const item of [...row.warnings, ...row.reviewNotes])
      expect(blocks(item.check).submit, item.check).toBe(false);
  }
});

test('the review judges in a criterion, so it never blocks by itself; the campus and the base do', () => {
  expect(blocks('deadline-adjusted')).toEqual({ submit: false, publish: false });
  expect(blocks('coverage-pending')).toEqual({ submit: true, publish: true });
  expect(blocks('system-error')).toEqual({ submit: true, publish: true });
  expect(blocks('stage-meeting')).toEqual({ submit: false, publish: false });
});
