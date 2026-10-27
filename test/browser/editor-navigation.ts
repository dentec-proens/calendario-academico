import type { Page } from '@playwright/test';
import { expect } from './test.ts';
import type { EditorSection } from '../../src/app-routes.ts';
import { calendarReferenceAnchor } from '../../src/calendar-reference.ts';
import type {} from '../fixtures/editor-client.ts';

/** Use the same expandable step picker offered to people on smaller screens. */
export async function selectEditorSection(page: Page, section: EditorSection) {
  if (section === 'history') {
    await selectEditorSection(page, 'events');
    await page.locator('[data-tab="anterior"]').click();
    await page.locator(`#${calendarReferenceAnchor}`).waitFor();
    return;
  }
  const menu = page.locator('.editor-step-menu');
  const toggle = menu.locator(':scope > summary');
  if ((await toggle.isVisible()) && (await menu.getAttribute('open')) === null)
    await toggle.click();
  await page.locator(`[data-view="${section}"]`).click();
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
