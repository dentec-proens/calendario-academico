import { test, expect } from './test.ts';
import { openCampusEvent } from './editor-navigation.ts';

test('campus list uses compact rows and keeps details and actions in the panel', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/eventos?aba=eventos');
  await expect(page.locator('#event-list')).toContainText('Evento local salvo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.events-tabs')).toHaveScreenshot('campus-tabs.png');
  await expect(page.locator('#event-list')).toHaveScreenshot('campus-event-list.png');
  await openCampusEvent(page, 'local-event');
  await expect(page.locator('.campus-event-record')).toBeVisible();
  await expect(page.locator('#event-panel')).toHaveScreenshot('campus-event-details.png');
});
