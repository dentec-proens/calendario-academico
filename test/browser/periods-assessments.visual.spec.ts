import { test, expect } from './test.ts';
import { addPeriod } from './editor-navigation.ts';

for (const editing of [false, true]) {
  test(`organization by offer ${editing ? 'shows immediate stage bounds feedback' : 'shows compact configured summaries'}`, async ({
    page,
    fixtureServer,
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await addPeriod(page, '2027-02-15', '2027-12-20');
    await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
    if (editing) {
      await page.locator('[data-edit-organization="integrado"]').click();
      await page.locator('#offer-integrado-period-0-start').fill('2027-02-22');
      await expect(page.locator('#offer-integrado-stage-0-error')).toContainText(
        'inteiramente dentro',
      );
    }
    // Neutral focus keeps full-page capture independent of Chromium's native date-field scrolling.
    // Focus and unobstructed controls are exercised by period-editor.spec.ts.
    await page.locator('#editor-section-title').focus();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page).toHaveScreenshot(
      editing ? 'period-editing.png' : 'periods-assessments.png',
      { fullPage: true },
    );
  });
}
