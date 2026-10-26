import type { CalendarActivity, TeachingState } from './domain-types.ts';
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { join } from 'node:path';
import { prepareChromium } from './printing/chromium-runtime.ts';
import type { ChromiumRuntime } from './printing/chromium-manifest.ts';
import { printCss, printLogo } from './printing/assets.generated.mjs';
import { proensLayout } from './printing/calendar-layout.ts';
import { evaluateCalendar } from './evaluation.ts';

export async function nativePdf(
  record: Parameters<typeof proensLayout>[3] & { state: TeachingState },
  events: CalendarActivity[],
  runtime: ChromiumRuntime,
) {
  let result: ReturnType<typeof evaluateCalendar> | null = null;
  try {
    result = evaluateCalendar(record.state, events);
  } catch {}
  const html =
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0}' +
    printCss +
    '</style><body>' +
    proensLayout(record.state, events, result, record, printLogo) +
    '</body></html>';
  const installation = await prepareChromium(runtime);
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: installation.executablePath,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: [
        join(installation.directory, 'al2023', 'lib'),
        installation.directory,
        process.env.LD_LIBRARY_PATH,
      ]
        .filter(Boolean)
        .join(':'),
      FONTCONFIG_PATH: join(installation.directory, 'fonts'),
      HOME: installation.directory,
    },
    headless: true,
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', (route) => {
      return route.request().url().startsWith('data:') ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(
      await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
    );
  } finally {
    await browser.close();
  }
}
