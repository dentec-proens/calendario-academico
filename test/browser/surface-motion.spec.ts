import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';

const running = (selector: string) =>
  `document.querySelector(${JSON.stringify(selector)})?.getAnimations().length ?? 0`;

/** Records every transition from now on, so a 200ms entrance cannot be missed between polls. */
const recordTransitions = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { transitions: string[] }).transitions = seen;
    document.addEventListener('transitionrun', (event) => {
      const target = event.target as Element;
      if (target.matches('dialog.ui-panel-dialog, .editor-more-content'))
        seen.push(`${target.tagName === 'DIALOG' ? 'panel' : 'menu'}:${event.propertyName}`);
    });
  });
const transitions = (page: Page) =>
  page.evaluate(() => (window as unknown as { transitions: string[] }).transitions);

test('the side panel and the menu arrive with motion', async ({ page, fixtureServer }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="events"]').click();
  await recordTransitions(page);
  await page.locator('#new-event').click();
  await expect.poll(() => transitions(page)).toContain('panel:translate');
  await page.locator('#close-event-panel').click();
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await expect.poll(() => transitions(page)).toContain('menu:scale');
});

test('with reduced motion the panel simply appears', async ({ page, fixtureServer }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="events"]').click();
  await page.locator('#new-event').click();
  await expect(page.locator('dialog[open].ui-panel-dialog')).toBeVisible();
  expect(await page.evaluate(running('dialog[open].ui-panel-dialog'))).toBe(0);
});

test('a pressed button sinks and comes back', async ({ page, fixtureServer }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(await fixtureServer('editor'));
  const button = page.locator('.ui-button--primary, .ui-button:not(.ui-button--secondary)').first();
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => button.evaluate((node) => getComputedStyle(node).scale)).toBe('0.97');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect.poll(() => button.evaluate((node) => getComputedStyle(node).scale)).toBe('none');
});
