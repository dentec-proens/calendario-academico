import type { Page } from '@playwright/test';
import { expect } from './test.ts';
import type { EditorSection } from '../../src/app/routes.ts';
import type { CalendarState } from '../../web/features/calendar-editor/types.ts';
import type {} from '../fixtures/editor-client.ts';
import { submittableState } from '../helpers/required-vacations.ts';

/** Use the same expandable step picker offered to people on smaller screens. */
export async function selectEditorSection(page: Page, section: EditorSection) {
  const menu = page.locator('.editor-step-menu');
  const toggle = menu.locator(':scope > summary');
  if ((await toggle.isVisible()) && (await menu.getAttribute('open')) === null)
    await toggle.click();
  await page.locator(`[data-view="${section === 'assessments' ? 'periods' : section}"]`).click();
}

/** Configure one offer through the real atomic periods-and-assessments form. */
export async function addPeriod(page: Page, start: string, end: string) {
  await selectEditorSection(page, 'periods');
  await configureOffer(page, 'integrado', start, end);
}

export async function configureOffer(page: Page, modality: string, start: string, end: string) {
  await expect(page.locator('#periods')).toBeVisible();
  const block = page.locator(`[data-offer="${modality}"]`);
  const creating = !(await block.count());
  const prefix = creating ? 'offer-new' : `offer-${modality}`;
  if (creating) {
    await page.locator('#add-offer').click();
    await page.locator('#offer-new-kind').selectOption(modality);
  } else if (!(await block.locator('form').isVisible())) {
    await page.locator(`[data-edit-organization="${modality}"]`).click();
  }
  await page.locator(`#${prefix}-organization [data-choice="anual"]`).click();
  await page.locator(`#${prefix}-period-0-start`).fill(start);
  await page.locator(`#${prefix}-period-0-end`).fill(end);
  await page.locator(`#${prefix}-count [data-choice="2"]`).click();
  const midpoint = Math.floor((Date.parse(start) + Date.parse(end)) / 2 / 86400000) * 86400000;
  const firstEnd = new Date(midpoint).toISOString().slice(0, 10);
  const secondStart = new Date(midpoint + 86400000).toISOString().slice(0, 10);
  for (const [index, dates] of [
    [start, firstEnd],
    [secondStart, end],
  ].entries()) {
    await page.locator(`#${prefix}-stage-${index}-start`).fill(dates[0]);
    await page.locator(`#${prefix}-stage-${index}-end`).fill(dates[1]);
  }
  await page.locator(`#${prefix}-apply`).click();
  if (creating) await expect(page.locator('#offer-new-form')).toHaveCount(0);
  await expect(block.locator('form')).toBeHidden();
}

/** Wait for the Convex confirmation and read the saved state with its save count. */
export async function savedState(page: Page) {
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
  return page.evaluate(() => ({
    state: window.editorTest.record.state,
    saves: window.editorTest.calls.saves,
  }));
}

/** Show the Activities step with the campus dates and the base group, where Teacher Day is. */
export async function selectCampusEvents(page: Page) {
  await selectEditorSection(page, 'events');
  await expect(page.locator('#events')).toBeVisible();
  if (await page.locator('#base-dates').count()) await openBaseDates(page);
}

/** Open an activity in the side panel, listing every activity when the filter hides it. */
export async function openActivity(page: Page, id: string) {
  if (!(await page.locator('#events').isVisible())) await selectEditorSection(page, 'events');
  if (await page.locator('#activity-mode-data').isChecked())
    await page.locator('#activity-mode-atividade').check();
  const row = page.locator(`[data-activity-open="${id}"]`);
  if (!(await row.isVisible())) await page.locator('#activity-pendency-todas').check();
  await row.click();
  await expect(page.locator('#event-panel')).toBeVisible();
}

/** Consult the saved record through the same compact row offered to people. */
export async function openCampusEvent(page: Page, id: string) {
  await page.locator(`[data-open-event="${id}"]`).click();
  await expect(page.locator('#event-panel')).toBeVisible();
}

/** Enter editing from a campus record's detail panel. */
export async function editCampusEvent(page: Page, id: string) {
  await openCampusEvent(page, id);
  await page.locator(`[data-edit-event="${id}"]`).click();
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
}

/** Expand the institutional base group, collapsed by default, where adjustable dates live. */
export async function openBaseDates(page: Page) {
  const toggle = page.locator('#group-base button');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Fills the vacations the norm requires for a submission, through the step that registers them. */
export async function fillRequiredVacations(page: Page) {
  await selectEditorSection(page, 'vacations');
  await page.locator('#vacation-add-school').click();
  await page.locator('#vacation-start').fill('2027-01-01');
  await page.locator('#vacation-end').fill('2027-01-31');
  await page.locator('#vacation-apply').click();
  await page.locator('#vacation-add-teacher').click();
  await page.locator('#vacation-start').fill('2027-01-01');
  await page.locator('#vacation-days').fill('45');
  await page.locator('#vacation-apply').click();
  await expect(page.locator('#vacation-teacher-summary')).toContainText('45 de 45 dias.');
}

/**
 * Completes the saved calendar for a test whose subject is not the pendencies: submitting refuses
 * any of them. The state reaches the open editor as a newer version, as another session's would,
 * so it is adopted only at rest (saved, nothing in edition).
 */
export async function completeForSubmission(page: Page) {
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', /^(idle|saved)$/);
  await expect(page.locator('#unapplied-status')).toBeHidden();
  // The record carries civil dates as plain strings, as they travel.
  const saved = (await page.evaluate(() => window.editorTest.record.state)) as CalendarState;
  const state = submittableState(saved);
  await page.evaluate(async (state) => {
    const { record } = window.editorTest;
    record.state = state;
    record.version++;
    await window.publishReviewerCalendar();
  }, state);
  // Adopted once no step keeps a pendency; the review may still list a missing identity.
  await expect(page.locator('[data-view]:not([data-view="issues"]) .editor-step-note')).toHaveCount(
    0,
  );
  await expect(page.locator('#lifecycle-submit-unavailable', { hasText: 'pendência' })).toHaveCount(
    0,
  );
}
