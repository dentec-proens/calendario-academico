import { civilDate } from '../../src/domain/civil-date.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from './test.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { inheritedEvents, initialCatalogue } from '../../src/domain/institution/catalogue.ts';
import { applyObservances } from '../../src/domain/calendar/observances.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

for (const width of [1440, 390]) {
  test(`prints offer labels and assessment cycles through Chromium at ${width}px`, async ({
    page,
  }, testInfo) => {
    const state = calendarOffersFixture();
    state.events.push(
      {
        id: 'previous-publication',
        name: 'Publicação realizada antes do ano',
        start: civilDate('2026-12-01'),
        end: civilDate('2026-12-01'),
        effect: 'note',
        notice: {
          publication: 'published',
          admission: { type: 'transfer', year: 2027, term: 'annual', destinations: [] },
        },
        offers: ['integrado'],
      },
      {
        id: 'previous-plan',
        name: 'Publicação programada antes do ano',
        start: civilDate('2026-11-01'),
        end: civilDate('2026-11-01'),
        effect: 'note',
        notice: { publication: 'planned' },
        offers: ['integrado'],
      },
      {
        id: 'cross-year-note',
        name: 'Registro informativo que atravessa o ano',
        start: civilDate('2026-12-15'),
        end: civilDate('2027-01-12'),
        effect: 'note',
        offers: ['integrado'],
      },
    );
    const paths = [
      '../../web/components/ui/tokens.css',
      '../../web/components/ui/ui.css',
      '../../web/style.css',
      '../../web/features/calendar-editor/calendar-editor.css',
      '../../assets/printing/calendar.css',
    ];
    const [styles, logo] = await Promise.all([
      Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8'))),
      readFile(new URL('../../assets/printing/ifpr-logo.png', import.meta.url)),
    ]);
    state.observanceDates = { 'public-servant-day': civilDate('2027-10-29') };
    const allEvents = [
      ...applyObservances(inheritedEvents(initialCatalogue(), state.year, state.offers), state),
      ...state.events,
    ];
    const html = proensLayout(
      state,
      allEvents,
      evaluateCalendar(state, allEvents),
      { status: 'rascunho', version: 1 },
      `data:image/png;base64,${logo.toString('base64')}`,
    );
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Calendário de referência v4</title><style>${styles.join('\n').replace(/@import[^;]+;/g, '')}</style></head><body><main class="main-column"><section id="calendar" class="view"><div class="panel"><div id="months">${html}</div></div></section></main></body></html>`,
    );
    await expect(page.locator('.proens-status-mark')).toHaveText('Rascunho — sem validade');
    await expect(page.locator('.proens-month h3')).toHaveText(
      Array.from({ length: 12 }, (_, month) =>
        new Date(Date.UTC(2027, month, 1)).toLocaleDateString('pt-BR', {
          month: 'long',
          timeZone: 'UTC',
        }),
      ).flatMap((month) => [month, month]),
    );
    await page.screenshot({ path: testInfo.outputPath('calendar-preview.png') });
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: testInfo.outputPath('calendar-print.png') });
    const october = page
      .locator('.proens-month')
      .filter({ has: page.getByRole('heading', { name: 'outubro', exact: true }) });
    await expect(
      october
        .locator('.event-grid tr')
        .filter({ hasText: 'Dia do Servidor Público' })
        .locator('td')
        .first(),
    ).toHaveText('29');
    await expect(page.locator('.proens-external-references tbody tr')).toHaveCount(3);
    await expect(page.locator('.proens-external-references')).toContainText(
      '15/12/2026 a 12/01/2027',
    );
    await expect(page.locator('.teaching-distribution-group')).toHaveCount(4);
    const electrical = page.locator('.teaching-distribution-group').filter({
      has: page.getByRole('heading', { name: 'Dias letivos — Engenharia Elétrica', exact: true }),
    });
    await expect(
      electrical.locator('caption').filter({ hasText: 'Etapas de avaliação' }),
    ).toHaveText(['Etapas de avaliação — 1º semestre', 'Etapas de avaliação — 2º semestre']);
    await expect(
      electrical.getByRole('rowheader').filter({ hasText: '1ª etapa — 2º semestre' }),
    ).toHaveCount(1);
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await writeFile(testInfo.outputPath('calendar-offers.pdf'), pdf);
    await testInfo.attach('calendar-offers.pdf', { body: pdf, contentType: 'application/pdf' });
    const [{ getDocument }, { WorkerMessageHandler }] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ]);
    (
      globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: unknown } }
    ).pdfjsWorker = { WorkerMessageHandler };
    const task = getDocument({
      data: Uint8Array.from(pdf),
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    });
    try {
      const document = await task.promise;
      const chunks: string[] = [];
      for (let n = 1; n <= document.numPages; n++) {
        const content = await (await document.getPage(n)).getTextContent();
        chunks.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      }
      const text = chunks.join(' ').replace(/\s+/g, ' ');
      for (const label of [
        'Licenciatura em Química',
        'Engenharia Elétrica',
        'Tecnologia em Análise de Sistemas',
        '1ª etapa — 2º semestre',
        '2ª etapa — 2º semestre',
        'Consolidado anual',
        'Publicação realizada antes do ano',
        'Publicação programada antes do ano',
        'Registro informativo que atravessa o ano',
        '01/12/2026',
        '15/12/2026 a 12/01/2027',
      ])
        expect(text).toContain(label);
      expect(text).toContain('Rascunho — sem validade');
      expect(text).not.toContain('Proposta preliminar');
      expect(text).not.toContain('Janela do ano letivo');
      expect(text).not.toContain('outubro 2027');
      expect(text).not.toContain('undefined');
    } finally {
      await task.destroy();
    }
  });
}

test('multi-category days paint all color bands under production CSP (style-src self) on screen and print', async ({
  page,
}) => {
  const [vercelRaw, css] = await Promise.all([
    readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../../assets/printing/calendar.css', import.meta.url), 'utf8'),
  ]);
  const vercel = JSON.parse(vercelRaw) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const csp = vercel.headers
    .find((entry) => entry.source === '/(.*)')
    ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
  expect(csp).toContain("style-src 'self'");

  const state = {
    year: 2027,
    campus: 'Foz',
    periods: [],
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'presencial' as const,
        organization: 'semestral' as const,
      },
    ],
  };
  const events = [
    {
      id: 'vac',
      name: 'Férias escolares',
      start: civilDate('2027-02-01'),
      end: civilDate('2027-02-10'),
      effect: 'exclude' as const,
      category: 'ferias',
      offers: ['graduacao'],
    },
    {
      id: 'form',
      name: 'Formação pedagógica',
      start: civilDate('2027-02-03'),
      end: civilDate('2027-02-05'),
      effect: 'note' as const,
      category: 'formacao',
      offers: ['graduacao'],
    },
    {
      id: 'rec',
      name: 'Recesso acadêmico e administrativo',
      start: civilDate('2027-02-08'),
      end: civilDate('2027-02-10'),
      effect: 'exclude' as const,
      category: 'recesso',
      offers: ['graduacao'],
    },
  ];
  const html = proensLayout(state, events, null, null, '');
  expect(html).not.toContain('style=');

  const origin = 'http://calendar-csp.test';
  await page.route(`${origin}/**`, async (route) => {
    const url = route.request().url();
    if (url.endsWith('/calendar.css')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        headers: { 'Content-Security-Policy': csp! },
        body: css.replace(/@import[^;]+;/g, ''),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': csp! },
      body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="/calendar.css"></head><body>${html}</body></html>`,
    });
  });

  const violations: string[] = [];
  await page.addInitScript(() => {
    window.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __cspViolations?: string[] }).__cspViolations ??= [];
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });
  });
  page.on('pageerror', (err) => violations.push(err.message));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/`);

  const recordedViolations = await page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  );
  expect([...violations, ...recordedViolations]).toEqual([]);

  const checkSplitCell = async (day: string, expectedColors: string[]) => {
    const cell = page
      .locator('.proens-month')
      .filter({ has: page.getByRole('heading', { name: 'fevereiro', exact: true }) })
      .locator('.month-grid td.cat-split')
      .filter({ has: page.locator('.day-number', { hasText: new RegExp(`^${day}$`) }) });
    await expect(cell).toHaveCount(1);
    const metrics = await cell.evaluate((td) => {
      const tdRect = td.getBoundingClientRect();
      const bands = td.querySelector('.cat-bands');
      const bandsRect = bands?.getBoundingClientRect();
      const items = [...td.querySelectorAll('.cat-bands > i')].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          bg: getComputedStyle(el).backgroundColor,
          width: rect.width,
          height: rect.height,
        };
      });
      return {
        tdWidth: tdRect.width,
        tdHeight: tdRect.height,
        bandsWidth: bandsRect?.width ?? 0,
        bandsHeight: bandsRect?.height ?? 0,
        items,
      };
    });
    expect(Math.abs(metrics.bandsWidth - metrics.tdWidth)).toBeLessThanOrEqual(3);
    expect(Math.abs(metrics.bandsHeight - metrics.tdHeight)).toBeLessThanOrEqual(3);
    expect(metrics.items.map((item) => item.bg)).toEqual(expectedColors);
    for (const item of metrics.items) {
      expect(item.width).toBeGreaterThan(5);
      expect(item.height).toBeGreaterThan(10);
    }
  };

  // Screen mode: recesso (#fabf8f) + ferias (#bfbfbf) on 8-10; ferias (#bfbfbf) + formacao (#00ff00) on 3-5
  await checkSplitCell('3', ['rgb(191, 191, 191)', 'rgb(0, 255, 0)']);
  await checkSplitCell('8', ['rgb(250, 191, 143)', 'rgb(191, 191, 191)']);
  await checkSplitCell('9', ['rgb(250, 191, 143)', 'rgb(191, 191, 191)']);
  await checkSplitCell('10', ['rgb(250, 191, 143)', 'rgb(191, 191, 191)']);

  // Print mode: same bands stay painted
  await page.emulateMedia({ media: 'print' });
  await checkSplitCell('8', ['rgb(250, 191, 143)', 'rgb(191, 191, 191)']);
  await checkSplitCell('3', ['rgb(191, 191, 191)', 'rgb(0, 255, 0)']);
});
