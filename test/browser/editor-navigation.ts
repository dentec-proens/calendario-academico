import type { Page } from '@playwright/test';
import { expect } from './test.ts';
import type { EditorSection } from '../../src/app-routes.ts';
import type {} from '../fixtures/editor-client.ts';

/** Use the same expandable step picker offered to people on smaller screens. */
export async function selectEditorSection(page: Page, section: EditorSection) {
  const menu = page.locator('.editor-step-menu');
  const toggle = menu.locator(':scope > summary');
  if ((await toggle.isVisible()) && (await menu.getAttribute('open')) === null)
    await toggle.click();
  await page.locator(`[data-view="${section === 'assessments' ? 'periods' : section}"]`).click();
}

/** Add one teaching period through the Periods step and wait until it is applied. */
export async function addPeriod(page: Page, start: string, end: string) {
  await selectEditorSection(page, 'periods');
  await page.locator('#period-name').fill('Período de aulas');
  await page.locator('#period-start').fill(start);
  await page.locator('#period-end').fill(end);
  await page.locator('#period-submit').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods.length))
    .toBe(1);
}

/** Wait for the Convex confirmation and read the saved state with its save count. */
export async function savedState(page: Page) {
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
  return page.evaluate(() => ({
    state: window.editorTest.record.state,
    saves: window.editorTest.calls.saves,
  }));
}

/** Show the step 6 tab with the campus events and the Teacher Day. */
export async function selectCampusEvents(page: Page) {
  await page.locator('[data-tab="eventos"]').click();
  await expect(page.locator('#tabpanel-eventos')).toBeVisible();
}

/** Open an activity in the side panel, listing every activity when the filter hides it. */
export async function openActivity(page: Page, id: string) {
  const tab = page.locator('[data-tab="atividades"]');
  if ((await tab.count()) && (await tab.getAttribute('aria-selected')) !== 'true')
    await tab.click();
  const row = page.locator(`[data-activity-open="${id}"]`);
  if (!(await row.isVisible())) await page.locator('#activity-status').selectOption('all');
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
