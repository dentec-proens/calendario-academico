import type { Page } from '@playwright/test';
import type { EditorSection } from '../../src/app-routes.ts';
import { calendarReferenceAnchor } from '../../src/calendar-reference.ts';

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
