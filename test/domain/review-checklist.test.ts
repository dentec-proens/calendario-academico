import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { cycleLink } from '../helpers/activity-links.ts';
import { contentAssessment, contentIssues } from '../../src/domain/calendar/readiness.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';

/**
 * The review step lists the same content issues the step menu counts and the submission confirms:
 * each one names its group, a title, a detail and where it is resolved, while its code and
 * message stay the ones kept in readiness and submissions.
 */
test('every content issue says where it belongs and where it is resolved', () => {
  const state = calendarOffersFixture();
  const { issues, notes } = contentAssessment({ state, institutionalSnapshot: [] });
  expect(issues.length).toBeGreaterThan(0);
  expect(issues).toEqual(contentIssues(state, []));
  for (const issue of [...issues, ...notes]) {
    expect(['structure', 'activities', 'dates', 'teaching-days']).toContain(issue.group);
    expect(issue.title.trim()).not.toBe('');
    expect(issue.detail.trim()).not.toBe('');
  }
  const activity = issues.find((issue) => issue.check === 'coverage-pending')!;
  expect(activity).toMatchObject({
    group: 'activities',
    offerId: expect.any(String),
    target: { area: 'activity' },
  });
  // The title is the activity alone; the offer is a separate field, not a prefix.
  expect(activity.message).toContain(activity.title);
  expect(activity.message.startsWith(activity.title)).toBe(false);
});

test('warnings keep their messages and gain the same structure', () => {
  const state = calendarOffersFixture();
  state.events.push({
    id: 'transfer-notice',
    name: 'Edital de transferência',
    start: civilDate('2027-01-10'),
    end: civilDate('2027-01-10'),
    effect: 'note',
    category: 'prazo',
    offers: ['integrado', 'graduacao'],
    activity: cycleLink('admission-notice', 'annual'),
    notice: {
      publication: 'planned',
      admission: {
        type: 'transfer',
        year: 2027,
        term: 'annual',
        destinations: [
          { offerId: 'integrado', periodId: 'integrado-annual' },
          { offerId: 'graduacao', periodId: 'removed' },
        ],
      },
    },
  });
  const { warnings, notes } = contentAssessment({ state, institutionalSnapshot: [] });
  expect(warnings).toEqual(notes.map((note) => note.message));
  expect(notes.find((note) => note.message.includes('Revise o destino do edital'))).toMatchObject({
    group: 'dates',
    offerId: 'graduacao',
    target: { area: 'date', eventId: 'transfer-notice', name: 'Edital de transferência' },
  });
});

test('when the count is unavailable, its issue names the structure to fix', () => {
  const state = calendarOffersFixture();
  state.periods = [];
  const issue = contentAssessment({ state, institutionalSnapshot: [] }).issues.find(
    (item) => item.check === 'count-unavailable' || item.check === 'periods-missing',
  )!;
  expect(issue.group).toBe('structure');
  expect(issue.detail).toMatch(/períodos letivos/);
});
