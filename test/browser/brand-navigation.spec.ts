import { test, expect } from './test.ts';

for (const width of [1440, 390]) {
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
