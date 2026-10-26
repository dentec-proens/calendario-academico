import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-client.ts';

test('reuses the worker server while isolating application memory, storage and cookies', async ({
  page,
  browser,
  fixtureServer,
}) => {
  const [url, repeated] = await Promise.all([fixtureServer('editor'), fixtureServer('editor')]);
  expect(repeated).toBe(url);
  await page.goto(url);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await page.evaluate(() => {
    window.editorTest.record.name = 'Sentinela do contexto anterior';
    localStorage.setItem('fixture-isolation', 'sentinel');
    document.cookie = 'fixture-isolation=sentinel; path=/';
  });

  const nextContext = await browser.newContext();
  try {
    const nextPage = await nextContext.newPage();
    const nextUrl = await fixtureServer('editor');
    expect(nextUrl).toBe(url);
    await nextPage.goto(nextUrl);
    await expect(nextPage.locator('#record-title')).toHaveText('2027 — Campus de teste');
    expect(await nextPage.evaluate(() => localStorage.getItem('fixture-isolation'))).toBeNull();
    expect(
      (await nextContext.cookies()).some((cookie) => cookie.name === 'fixture-isolation'),
    ).toBe(false);
  } finally {
    await nextContext.close();
  }
});
