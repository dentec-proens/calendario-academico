import { test, expect } from './test.ts';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { earlierFormatCopyMessage } from '../../src/domain/calendar/normalization/input.ts';
import type {} from '../fixtures/editor-client.ts';

/**
 * The editable JSON copy is in format 5. A copy exported by the editor is imported again, keeping
 * the effective category of a date without category; a format 4 copy is refused with its own
 * message and never converted.
 */
test('a current copy round-trips and earlier formats are refused with their own message', async ({
  page,
  fixtureServer,
  cleanup,
}) => {
  const fixtureUrl = await fixtureServer('editor-confirmation');
  const directory = await mkdtemp(join(tmpdir(), 'calendar-copy-format-'));
  cleanup(() => rm(directory, { recursive: true, force: true }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${fixtureUrl}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');

  await page.locator('.editor-more > summary').click();
  const download = page.waitForEvent('download');
  await page.locator('#save').click();
  const exportedFile = join(directory, 'exportada.json');
  await (await download).saveAs(exportedFile);
  const exported = JSON.parse(await readFile(exportedFile, 'utf8')) as Record<string, unknown> & {
    offers: { id: string }[];
    events: Record<string, unknown>[];
  };
  expect(exported.schemaVersion).toBe(6);

  // A date without category, as the stored v4 notes without category were.
  const copy = {
    ...exported,
    events: [
      ...exported.events,
      {
        id: 'imported-note',
        name: 'Data sem categoria importada',
        start: '2027-03-10',
        end: '2027-03-10',
        effect: 'note',
        offers: exported.offers.map((offer) => offer.id),
      },
    ],
  };
  const picker = page.locator('input#file');

  const formatFour = join(directory, 'formato-4.json');
  await writeFile(
    formatFour,
    JSON.stringify({
      ...copy,
      schemaVersion: 4,
      events: copy.events.map(({ effect, ...event }) => ({ ...event, kind: effect })),
    }),
  );
  await picker.setInputFiles(formatFour);
  await expect(page.locator('#message')).toContainText(earlierFormatCopyMessage(4));
  await expect(page.locator('#message .ui-notice')).toHaveAttribute('data-tone', 'danger');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(0);

  const formatFive = join(directory, 'formato-5.json');
  await writeFile(formatFive, JSON.stringify({ ...copy, schemaVersion: 5 }));
  await picker.setInputFiles(formatFive);
  await expect(page.locator('#message')).toContainText(earlierFormatCopyMessage(5));

  const current = join(directory, 'formato-6.json');
  await writeFile(current, JSON.stringify(copy));
  await picker.setInputFiles(current);
  await expect(page.locator('dialog[open]')).toContainText('Formato 6: 1 ofertas');
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#message')).toContainText('Cópia aplicada');
  await page.waitForFunction(() =>
    window.editorTest.record.state.events.some((event) => event.id === 'imported-note'),
  );
  expect(
    await page.evaluate(() =>
      window.editorTest.record.state.events.find((event) => event.id === 'imported-note'),
    ),
  ).toMatchObject({ effect: 'note', category: 'institucional' });
  expect(errors).toEqual([]);
});
