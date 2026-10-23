import type { CalendarActivity, TeachingState } from './domain-types.ts';
import chromium, { inflate } from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { open, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printCss, printLogo } from './native-print-assets.mjs';
import { proensLayout } from '../web/print.ts';
import { evaluateCalendar } from './evaluation.ts';

let browserPreparation: Promise<string> | undefined;

async function installChromium() {
  // The npm package includes x64 only; Convex Node workers may be ARM64.
  // Use the same vendor/version's ARM pack, including its shared libraries.
  let executablePath;
  if (process.arch === 'arm64') {
    try {
      const file = await open('/tmp/chromium', 'r');
      try {
        // Inspect only the ELF header, not the entire browser binary.
        const header = Buffer.alloc(20);
        const { bytesRead } = await file.read(header, 0, header.length, 0);
        if (bytesRead < header.length || header[0] !== 0x7f || header.readUInt16LE(18) !== 183)
          await rm('/tmp/chromium');
      } finally {
        await file.close();
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.arm64.tar',
    );
    await inflate('/tmp/chromium-pack/al2023.tar.br');
  } else {
    executablePath = await chromium.executablePath();
    // Convex is not identified as Amazon Linux by the vendor's detection.
    // Extract the matching x64 libraries explicitly as well.
    const vendorDirectory = dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium')));
    await inflate(join(vendorDirectory, '..', 'bin', 'al2023.tar.br'));
  }
  return executablePath;
}

function prepareChromium() {
  // Concurrent PDF actions in a warm worker share only installation work.
  // A failed extraction remains retryable; each PDF opens its own browser.
  browserPreparation ??= installChromium().catch((error) => {
    browserPreparation = undefined;
    throw error;
  });
  return browserPreparation;
}

export async function nativePdf(
  record: Parameters<typeof proensLayout>[3] & { state: TeachingState },
  events: CalendarActivity[],
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
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await prepareChromium(),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      FONTCONFIG_PATH: '/tmp/fonts',
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
