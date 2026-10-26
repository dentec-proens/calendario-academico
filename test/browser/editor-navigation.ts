import type { Page } from '@playwright/test';
import { expect } from './test.ts';
import type { EditorSection } from '../../src/app-routes.ts';
import { calendarReferenceAnchor } from '../../src/calendar-reference.ts';
import type {} from '../fixtures/editor-client.ts';

/** Use the same expandable step picker offered to people on smaller screens. */
export async function selectEditorSection(page: Page, section: EditorSection) {
  if (section === 'history') {
    await selectEditorSection(page, 'events');
    const reference = page.locator(`#${calendarReferenceAnchor}`);
    await reference.waitFor();
    if ((await reference.getAttribute('open')) === null)
      await reference.locator(':scope > summary').click();
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
