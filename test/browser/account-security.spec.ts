import { test, expect } from './test.ts';

for (const width of [1440, 390])
  test(`ADMIN unlock is keyboard accessible and unobstructed at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/contas');
    const button = page.locator('[data-unlock-password="user-campus"]');
    await expect(button).toHaveAccessibleName(/Desbloquear login por senha de Responsável/);
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    await expect(button).toBeFocused();
    expect(
      await button.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      }),
    ).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Login por senha desbloqueado', { exact: false })).toContainText(
      'Login por senha desbloqueado',
    );
    expect(await page.evaluate(() => window.portalRouterTest.mutations.at(-1)?.args)).toEqual({
      id: 'user-campus',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
