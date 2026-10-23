import { beforeAll, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { writePrintAssets } from '../../scripts/print-assets.ts';
import type { nativePdf as NativePdf } from '../../src/native-pdf.ts';

// Parse the real browser output without downloading a PDF.js worker or fonts.
(
  globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: unknown } }
).pdfjsWorker = { WorkerMessageHandler };

let nativePdf: typeof NativePdf;

beforeAll(async () => {
  if (process.platform !== 'linux')
    throw new Error('O teste do PDF serverless exige Linux. Use pnpm test:runtime:linux.');
  await writePrintAssets();
  ({ nativePdf } = await import('../../src/native-pdf.ts'));
});

const record = {
  name: 'Calendário sintético do runtime',
  courses: 'Técnico em Informática — conferência de impressão',
  classes: 'Turma sintética',
  purpose: 'test',
  version: 1,
  currentCatalogueRevision: 1,
  state: {
    campus: 'Campus de impressão sintético',
    year: 2097,
    modalities: ['integrado'],
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata sintética',
    periods: [{ id: 'annual', name: 'Ano letivo', start: '2097-03-01', end: '2097-11-30' }],
    assessmentStagesByModality: { integrado: 4 },
  },
};

async function inspectPdf(bytes: Buffer) {
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const task = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    expect(pdf.numPages).toBeGreaterThan(0);
    const text = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      // Chromium rounds the physical paper size to fractions of a PDF point.
      expect(Math.abs(viewport.width - (210 * 72) / 25.4)).toBeLessThan(1);
      expect(Math.abs(viewport.height - (297 * 72) / 25.4)).toBeLessThan(1);
      const content = await page.getTextContent();
      text.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return text.join(' ').replace(/\s+/g, ' ');
  } finally {
    await task.destroy();
  }
}

test('serverless Chromium prints concurrent calendars through the actual application template', async () => {
  // The first concurrent calls share cold-start extraction, then use isolated
  // browsers. No executable override, Playwright test browser, or remote backend.
  const existingTemporaryFiles = new Set(await readdir(tmpdir()));
  const [testCopy, proposalCopy] = await Promise.all([
    nativePdf(record, []),
    nativePdf({ ...record, purpose: 'definitive', proposalCopy: true, version: 2 }, []),
  ]);
  const testText = await inspectPdf(testCopy);
  const proposalText = await inspectPdf(proposalCopy);
  for (const text of [testText, proposalText]) {
    expect(text).toContain('INSTITUTO FEDERAL DO PARANÁ');
    expect(text).toContain('CALENDÁRIO ACADÊMICO E ADMINISTRATIVO 2097');
    expect(text).toContain('Campus de impressão sintético');
    expect(text).toContain('Técnico em Informática');
    expect(text).toMatch(/legendas e contagem/i);
  }
  expect(testText).toContain('CALENDÁRIO DE TESTE');
  expect(testText).toContain('Versão 1');
  expect(proposalText).toContain('CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS');
  expect(proposalText).toContain('Versão 2');
  expect(proposalText).not.toContain('CALENDÁRIO DE TESTE');
  const leakedBrowserDirectories = (await readdir(tmpdir())).filter(
    (name) =>
      /^playwright_(chromiumdev_profile|artifacts)-/.test(name) &&
      !existingTemporaryFiles.has(name),
  );
  expect(
    leakedBrowserDirectories,
    'warm workers must release browser profiles and artifacts',
  ).toEqual([]);
});

test('print template renders external image markup as text without accessing its URL', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.end('external content must not enter the document');
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing local fixture address');
    const externalImage = `<img src="http://127.0.0.1:${address.port}/external-image" alt="SENTINELA-EXTERNA">`;
    const bytes = await nativePdf(record, [
      {
        id: 'synthetic-untrusted-label',
        name: externalImage,
        start: '2097-03-02',
        end: '2097-03-02',
        kind: 'include',
        evidence: 'Rótulo sintético',
      },
    ]);
    const text = await inspectPdf(bytes);
    expect(text).toContain('<img src=');
    expect(text).toContain('SENTINELA-EXTERNA');
    expect(requests).toEqual([]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
