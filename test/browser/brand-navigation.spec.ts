import { test, expect } from './test.ts';

for (const width of [1440, 390]) {
  test(`navigation from a removed page button still focuses the destination heading at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    const clockStart = new Date('2027-01-01T12:00:00Z');
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.clock.install({ time: clockStart });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/campi');
    const source = page.getByRole('button', { name: 'Ver calendários' }).first();
    await expect(source).toBeVisible();
    await page.clock.pauseAt(new Date(clockStart.getTime() + 60_000));
    await source.click();
    await expect(page).toHaveURL(origin + '/calendarios?campus=campus-a');
    await expect(page.locator('#panel-title')).toHaveText('Calendários');
    await expect(source).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    await page.clock.runFor(32);
    await expect(page.locator('#panel-title')).toBeFocused();
    await page.clock.resume();
    await expect(page.locator('#calendar-list')).toBeVisible();
    await expect(source).toHaveCount(0);
  });

  test(`a deferred return-route heading focus preserves header keyboard navigation at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    const clockStart = new Date('2027-01-01T12:00:00Z');
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.clock.install({ time: clockStart });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/campi');
    await expect(page.locator('#campus-list')).toBeVisible();
    const brand = page.getByRole('link', { name: 'Calendários Acadêmicos — página inicial' });
    const heading = page.locator('#panel-title');
    await brand.getByRole('img', { name: 'Instituto Federal do Paraná' }).click();
    await expect(page).toHaveURL(origin + '/calendarios');
    await expect(page.locator('#calendar-list')).toBeVisible();
    await expect(heading).toBeFocused();

    await page.clock.pauseAt(new Date(clockStart.getTime() + 60_000));
    await page.goBack();
    await expect(page).toHaveURL(origin + '/campi');
    await expect(heading).toHaveText('Campi');
    await expect(heading).toBeFocused();
    await brand.focus();
    await page.clock.runFor(32);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(brand).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(origin + '/calendarios');
  });

  test(`the institutional header returns home with mouse and keyboard at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/campi');
    const brand = page.getByRole('link', { name: 'Calendários Acadêmicos — página inicial' });
    const logo = brand.getByRole('img', { name: 'Instituto Federal do Paraná' });
    await expect(brand).toHaveAttribute('href', '/');
    await expect(brand).toContainText('PROENS');
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(brand).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    let documentRequests = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
    });
    await logo.click();
    await expect(page).toHaveURL(origin + '/calendarios');
    await expect(page.locator('#calendar-list')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(origin + '/campi');
    await expect(page.locator('#panel-title')).toBeFocused();
    await brand.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(brand).toBeFocused();
    expect(await brand.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(origin + '/calendarios');
    expect(documentRequests).toBe(0);
  });
}
