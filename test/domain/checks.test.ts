import { expect, test } from 'vitest';
import { checks } from '../../src/domain/calendar/checks.ts';
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
