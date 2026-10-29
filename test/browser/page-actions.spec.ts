import { test, expect } from './test.ts';

for (const width of [1440, 390, 320]) {
  test(`page actions share their appearance and right alignment at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    for (const path of [
      '/documentos',
      '/calendarios',
      '/eventos-institucionais',
      '/campi',
      '/contas',
      '/logs',
      '/revisoes',
    ]) {
      await page.goto(origin + path);
      const action = page.locator('.page-action');
      await expect(action).toBeVisible();
      await expect(action).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(action).toHaveCSS('color', 'rgb(12, 80, 58)');
      const alignment = await action.evaluate((button) => {
        const parent = button.parentElement!;
        const style = getComputedStyle(parent);
        return Math.abs(
          button.getBoundingClientRect().right -
            (parent.getBoundingClientRect().right -
              parseFloat(style.paddingRight) -
              parseFloat(style.borderRightWidth)),
        );
      });
      expect(alignment, path).toBeLessThan(2);
      await page.locator('#panel-title').focus();
      for (let tab = 0; tab < 15; tab++) {
        await page.keyboard.press('Tab');
        if (await action.evaluate((button) => button === document.activeElement)) break;
      }
      await expect(action).toBeFocused();
      await expect(action).toBeInViewport();
      expect(
        await action.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          return button.contains(
            document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            ),
          );
        }),
        path,
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}
