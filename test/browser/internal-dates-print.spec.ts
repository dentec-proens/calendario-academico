import { readFile, writeFile } from 'node:fs/promises';
import { civilDate } from '../../src/domain/civil-date.ts';
import { createCampusDate } from '../../src/domain/calendar/commands/events.ts';
import { projectDates } from '../../src/domain/calendar/model.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { proensLayout, type PrintVersion } from '../../src/printing/calendar-layout.ts';
import { ivaiporaAnnual } from '../fixtures/pending-links-2027.ts';
import { editCampusEvent, savedState } from './editor-navigation.ts';
import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-client.ts';

/**
 * Official and complete print (art. 18): the choice in the preview and both versions printed by
 * Chromium.
 */

async function pdfText(pdf: Buffer) {
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
    return chunks.join(' ').replace(/\s+/g, ' ');
  } finally {
    await task.destroy();
  }
}

for (const width of [1440, 390]) {
  test(`Chromium prints the official and the complete versions with the same count at ${width}px`, async ({
    page,
  }, testInfo) => {
    let state = ivaiporaAnnual();
    state = createCampusDate(state, {
      id: 'campus-rehearsal',
      name: 'Ensaio interno da banda',
      start: civilDate('2027-03-10'),
      end: civilDate('2027-03-11'),
      effect: 'note',
      category: 'evento',
      offers: ['integrado'],
      internal: true,
    });
    state = createCampusDate(state, {
      id: 'campus-planning',
      name: 'Planejamento interno anterior',
      start: civilDate('2026-12-07'),
      end: civilDate('2026-12-07'),
      effect: 'note',
      category: 'prazo',
      offers: ['integrado'],
      internal: true,
    });
    const events = projectDates([], state.events);
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
    await page.setViewportSize({ width, height: 1000 });
    const printed: Record<PrintVersion, { totals: string[]; text: string }> = {
      official: { totals: [], text: '' },
      complete: { totals: [], text: '' },
    };
    for (const version of ['official', 'complete'] as const) {
      const html = proensLayout(
        state,
        events,
        evaluateCalendar(state, events),
        { status: 'rascunho', version: 1 },
        `data:image/png;base64,${logo.toString('base64')}`,
        version,
      );
      await page.emulateMedia({ media: 'screen' });
      await page.setContent(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Calendário ${version}</title><style>${styles.join('\n').replace(/@import[^;]+;/g, '')}</style></head><body><main class="main-column"><section id="calendar" class="view"><div class="panel"><div id="months">${html}</div></div></section></main></body></html>`,
      );
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: testInfo.outputPath(`calendar-${version}-print.png`) });
      const march = page
        .locator('.proens-month')
        .filter({ has: page.getByRole('heading', { name: 'março', exact: true }) });
      const marks = page.locator('.month-grid .internal-day-mark');
      if (version === 'complete') {
        await expect(page.locator('.proens-version-mark')).toBeVisible();
        await expect(marks).toHaveCount(2);
        for (const mark of await marks.all()) {
          const box = await mark.boundingBox();
          expect(box && box.width > 0 && box.height > 0).toBe(true);
        }
        await expect(march.locator('.event-grid tr.internal-date')).toHaveText(
          /^10 a 11Ensaio interno da bandaData interna/,
        );
        await expect(page.locator('.proens-key')).toContainText('Data interna');
      } else {
        await expect(page.locator('.proens-version-mark')).toHaveCount(0);
        await expect(marks).toHaveCount(0);
        await expect(page.locator('.internal-date, .internal-swatch')).toHaveCount(0);
      }
      printed[version].totals = await page.locator('.monthly-total').allTextContents();
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      await writeFile(testInfo.outputPath(`calendar-${version}.pdf`), pdf);
      printed[version].text = await pdfText(pdf);
    }
    expect(printed.official.totals).toHaveLength(12);
    expect(printed.complete.totals).toEqual(printed.official.totals);
    const { official, complete } = printed;
    for (const text of ['Ensaio interno da banda', 'Planejamento interno anterior', 'Data interna'])
      expect(official.text).not.toContain(text);
    for (const text of [
      'Ensaio interno da banda',
      'Planejamento interno anterior',
      'Data interna',
      'não substitui o calendário oficial',
    ])
      expect(complete.text).toContain(text);
    // Coinciding annual and semester dates stay distinct in both versions.
    for (const text of [official.text, complete.text])
      for (const name of [
        'Data sintética final-2',
        'Registro anual sintético final',
        'Data sintética diary-2',
        'Registro anual sintético diary',
        'Data sintética registration-1',
        'Registro anual sintético registration',
        'Edital de ingresso do 1º semestre',
        'Registro anual sintético admission-notice',
        'Data sintética recognition-1',
        'Registro anual sintético recognition',
      ])
        expect(text, name).toContain(name);
  });

  test(`the preview chooses the printed version only with internal dates, by keyboard, at ${width}px`, async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
    await editCampusEvent(page, 'local-event');
    await page.locator('#event-internal').check();
    await page.locator('#event-form button[type="submit"]').click();
    expect(
      (await savedState(page)).state.events.find((event) => event.id === 'local-event')?.internal,
    ).toBe(true);
    await page.locator('#close-event-panel').click();
    await page.locator('[data-view="calendar"]').click();

    const choice = page.locator('#print-version');
    const official = choice.getByRole('radio', { name: 'Versão oficial (sem datas internas)' });
    const complete = choice.getByRole('radio', { name: 'Versão completa (com datas internas)' });
    const preview = page.locator('#months .proens-document');
    await expect(choice).toHaveAccessibleName('Versão impressa');
    await expect(official).toBeChecked();
    await expect(page.locator('#print-version-help')).toContainText(
      'A versão enviada à Proens e publicada é a oficial.',
    );
    await expect(preview).toBeVisible();
    await expect(preview).not.toContainText('Evento local salvo');
    await expect(preview).not.toHaveAttribute('data-print-version', 'complete');

    await official.focus();
    await page.keyboard.press('ArrowDown');
    await expect(complete).toBeChecked();
    await expect(complete).toBeFocused();
    await expect(page).toHaveURL(/[?&]impressao=completa(&|$)/);
    await expect(preview).toHaveAttribute('data-print-version', 'complete');
    await expect(preview.locator('.proens-version-mark')).toHaveText(
      'Versão completa: inclui datas de organização interna (art. 18); não substitui o calendário oficial',
    );
    await expect(preview.locator('tr.internal-date')).toContainText(
      'Evento local salvoData interna',
    );
    await page.screenshot({ path: testInfo.outputPath('preview-complete.png') });

    await page.evaluate(() => {
      window.print = () => document.body.setAttribute('data-print-title', document.title);
    });
    await page.locator('#print').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-print-title',
      /^rascunho-calendario-2027-v\d+-completo$/,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'print' });
    await expect(choice).toBeHidden();
    await expect(preview.locator('.proens-version-mark')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    await complete.focus();
    await page.keyboard.press('ArrowUp');
    await expect(official).toBeChecked();
    await expect(page).not.toHaveURL(/impressao=/);
    await expect(preview).not.toContainText('Evento local salvo');
    await page.locator('#print').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-print-title',
      /^rascunho-calendario-2027-v\d+$/,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('without internal dates the preview offers no choice and ignores `impressao=completa`', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/visualizar?impressao=completa');
  const preview = page.locator('#months .proens-document');
  await expect(preview).toContainText('Evento local salvo');
  await expect(page.locator('#print-version')).toHaveCount(0);
  await expect(preview).not.toHaveAttribute('data-print-version', 'complete');
  await expect(preview.locator('.proens-version-mark')).toHaveCount(0);
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute('data-print-title', document.title);
  });
  await page.locator('#print').click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-print-title',
    /^rascunho-calendario-2027-v\d+$/,
  );
});
