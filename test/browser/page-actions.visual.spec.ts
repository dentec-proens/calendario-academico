import { test, expect } from './test.ts';

for (const [path, name] of [
  ['/calendarios/lixeira', 'calendar-trash'],
  ['/eventos-institucionais', 'institutional-events'],
  ['/campi', 'campuses'],
  ['/contas', 'accounts'],
  ['/revisoes', 'reviews'],
]) {
  test(`page action on ${name}`, async ({ page, fixtureServer }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + path);
    if (path === '/calendarios/lixeira')
      await expect(page.locator('#calendar-trash-list')).toBeVisible();
    else await expect(page.locator('.page-action')).toBeVisible();
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
