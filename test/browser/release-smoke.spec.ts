import { test, expect } from './test.ts';
import { verifyCalendarPdf } from '../../scripts/release-smoke-browser.ts';

test('production smoke downloads a PDF through the actual calendar preview control', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.route('**/smoke-reference.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\n%%EOF\n' }),
  );
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-event-drafts-client.ts';
    const module = (await import(modulePath)) as { convex: { action: () => Promise<unknown> } };
    module.convex.action = () =>
      Promise.resolve({ url: new URL('/smoke-reference.pdf', location.origin).href });
  });
  page.setDefaultTimeout(2000);
  await verifyCalendarPdf(page);
  await expect(page.locator('#message')).toContainText('PDF gerado');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
