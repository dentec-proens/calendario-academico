import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from './test.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { inheritedEvents, initialCatalogue } from '../../src/domain/institution/catalogue.ts';
import { applyObservances } from '../../src/domain/calendar/observances.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

for (const width of [1440, 390]) {
  test(`prints offer labels and assessment cycles through Chromium at ${width}px`, async ({
    page,
  }, testInfo) => {
    const state = calendarOffersV4Fixture();
    state.events.push(
      {
        id: 'previous-publication',
        name: 'Publicação realizada antes do ano',
        start: '2026-12-01',
        end: '2026-12-01',
        kind: 'note',
        publicationStatus: 'published',
        admission: { type: 'transfer', year: 2027, term: 'annual' },
        offers: ['integrado'],
      },
      {
        id: 'previous-plan',
        name: 'Publicação prevista antes do ano',
        start: '2026-11-01',
        end: '2026-11-01',
        kind: 'note',
        publicationStatus: 'planned',
        offers: ['integrado'],
      },
      {
        id: 'cross-year-note',
        name: 'Registro informativo que atravessa o ano',
        start: '2026-12-15',
        end: '2027-01-12',
        kind: 'note',
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
    state.observanceDates = { 'public-servant-day': '2027-10-29' };
    const allEvents = [
      ...applyObservances(inheritedEvents(initialCatalogue(), state.year, state.offers), state),
      ...state.events,
    ];
    const html = proensLayout(
      state,
      allEvents,
      evaluateCalendar(state, allEvents),
      { purpose: 'test', version: 1 },
      `data:image/png;base64,${logo.toString('base64')}`,
    );
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Calendário de referência v4</title><style>${styles.join('\n').replace(/@import[^;]+;/g, '')}</style></head><body><main class="main-column"><section id="calendar" class="view"><div class="panel"><div id="months">${html}</div></div></section></main></body></html>`,
    );
    await page.emulateMedia({ media: 'print' });
    const october = page
      .locator('.proens-month')
      .filter({ has: page.getByRole('heading', { name: 'outubro 2027', exact: true }) });
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
    await writeFile(testInfo.outputPath('calendar-offers-v4.pdf'), pdf);
    await testInfo.attach('calendar-offers-v4.pdf', { body: pdf, contentType: 'application/pdf' });
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
        'Publicação prevista antes do ano',
        'Registro informativo que atravessa o ano',
        '01/12/2026',
        '15/12/2026 a 12/01/2027',
      ])
        expect(text).toContain(label);
      expect(text).not.toContain('undefined');
    } finally {
      await task.destroy();
    }
  });
}
