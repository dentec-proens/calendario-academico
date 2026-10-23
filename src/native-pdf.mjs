import chromium, { inflate } from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { open, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printCss, printLogo } from './native-print-assets.mjs';
import { proensLayout } from '../web/print.mjs';
import { evaluateCalendar } from './evaluation.mjs';

let browserPreparation;

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
      if (error.code !== 'ENOENT') throw error;
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

export async function nativePdf(record, events) {
  let result = null;
  try {
    result = evaluateCalendar(record.state, events);
  } catch {}
  const html =
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0}' +
    printCss +
    '</style><body>' +
    proensLayout(record.state, events, result, record, printLogo) +
    '</body></html>';
  const executablePath = await prepareChromium();
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      FONTCONFIG_PATH: '/tmp/fonts',
    },
    headless: 'shell',
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(
      await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
    );
  } finally {
    await browser.close();
  }
}
