import { test, expect } from './test.ts';

for (const width of [1440, 390]) {
  test(`page navigation delays its accessible loading bar at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios');
    await expect(page.locator('#calendar-list')).toBeVisible();
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/features/rules/RulesPage.tsx*', async (route) => {
      await pending;
      await route.continue();
    });
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    if (width === 390) await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="rules"]').click();
    const loading = page.locator('.page-loading');
    await expect(loading).toHaveCount(1);
    await page.clock.runFor(199);
    await expect(loading.locator('.page-loading-bar')).toHaveCount(0);
    await expect(loading.getByRole('status')).toBeEmpty();
    await page.clock.runFor(1);
    await expect(loading.locator('.page-loading-bar')).toBeVisible();
    await expect(loading.getByRole('status')).toHaveText('Carregando página…');
    await expect(loading.getByRole('status')).toHaveCSS('clip-path', 'inset(50%)');
    await expect(page.locator('#panel-title')).toHaveText('Regras do calendário');
    await expect(page.locator('#panel-title')).toBeFocused();
    const bar = await loading.locator('.page-loading-bar').boundingBox();
    expect(bar?.height).toBe(3);
    expect(bar && bar.x >= 0 && bar.x + bar.width <= width).toBe(true);
    await expect(loading.locator('.page-loading-bar')).toHaveAttribute('aria-hidden', 'true');
    expect(
      await loading
        .locator('.page-loading-bar')
        .evaluate((element) => getComputedStyle(element, '::after').animationName),
    ).toBe('none');
    await page.screenshot({ path: `test-results/page-loading-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(
      await loading
        .locator('.page-loading-bar')
        .evaluate((element) => getComputedStyle(element, '::after').animationName),
    ).toBe('page-loading-progress');
    release();
    await expect(page.locator('.rules-page')).toBeVisible();
    await expect(loading).toHaveCount(0);
    await page.clock.runFor(1000);
    await expect(loading).toHaveCount(0);
  });
}

test('a page loaded before 200 ms leaves no loading bar or pending timer', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/features/rules/RulesPage.tsx*', async (route) => {
    await pending;
    await route.continue();
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.locator('[data-page="rules"]').click();
  await expect(page.locator('.page-loading')).toHaveCount(1);
  await page.clock.runFor(100);
  await expect(page.locator('.page-loading-bar')).toHaveCount(0);
  release();
  await expect(page.locator('.rules-page')).toBeVisible();
  await expect(page.locator('.page-loading')).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(page.locator('.page-loading-bar')).toHaveCount(0);
});
