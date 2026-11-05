import { selectEditorSection } from './editor-navigation.ts';
import type * as EditorFixture from '../fixtures/editor-client.ts';
import { test, expect } from './test.ts';
import { publishBaseUpdate } from './base-update.ts';

for (const width of [1440, 390]) {
  test(`changed institutional events are told and ask for nothing at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await publishBaseUpdate(page);
    const notice = page.locator('#base-changes-notice');
    await expect(notice).toContainText('Este calendário já segue a base vigente.');
    await expect(notice).toContainText('Incluído: Encontro institucional');
    await expect(notice).toContainText('Retirado: Recesso removido');
    await expect(notice).toContainText('de 15 out para 14 out');
    await expect(notice).not.toContainText('Suas datas não mudaram');
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);

    // The next save records the base, with no acceptance in the way.
    await page.locator('#weekdays input[value="5"]').uncheck();
    await expect
      .poll(() => page.evaluate(() => window.editorTest.calls.saves), { timeout: 5000 })
      .toBe(1);
    expect(
      await page.evaluate(() =>
        window.editorTest.record.institutionalSnapshot.some((event) => event.id === 'added-event'),
      ),
    ).toBe(true);
  });
}

test('a document-only update is told and asks for nothing', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await publishBaseUpdate(page, true);
  const notice = page.locator('#base-changes-notice');
  await expect(notice).toContainText('Os documentos de referência foram atualizados.');
  await expect(notice).toContainText('Orientações atualizadas');
  await notice.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(notice).toHaveCount(0);
});

test('newer rules are told and ask for nothing', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.rulesetVersion = 'consup-292-2027-v6';
    record.version++;
    return window.publishReviewerCalendar();
  });
  const notice = page.locator('#base-changes-notice');
  await expect(notice).toContainText('As novas regras não alteraram suas datas.');
  await expect(notice).toContainText('Trancamento de curso');
  await expect(notice).not.toContainText('consup-292');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('a returned calendar is warned that a review would have to be redone', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.rulesetVersion = 'consup-292-2027-v6';
    record.status = 'devolvido';
    record.version++;
    return window.publishReviewerCalendar();
  });
  await expect(page.locator('#base-changes-notice')).toContainText(
    'Se já houver parecer, ele precisará ser refeito sob estas regras.',
  );
});

test('a withdrawn reference document is told', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await publishBaseUpdate(page, true);
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-client.ts';
    const { record, publish } = (await import(modulePath)) as typeof EditorFixture;
    record.documentSnapshot = record.currentDocuments;
    record.currentDocuments = [];
    publish();
  });
  await expect(page.locator('#base-changes-notice')).toContainText(
    'Documento de referência retirado: Orientações atualizadas.',
  );
});

test('an equivalent base advance stays invisible and writes nothing', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));

  await selectEditorSection(page, 'periods');
  await page.locator('[data-edit-organization="integrado"]').click();
  await page.locator('#offer-integrado-period-0-start').fill('2027-03-01');
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-client.ts';
    const module = (await import(modulePath)) as typeof EditorFixture;
    module.record.currentCatalogueRevision = 3;
    module.publish();
  });
  await expect(page.locator('#offer-integrado-period-0-start')).toHaveValue('2027-03-01');
  expect(
    await page.evaluate(() => ({
      saves: window.editorTest.calls.saves,
      version: window.editorTest.record.version,
      revision: window.editorTest.record.catalogueRevision,
    })),
  ).toEqual({ saves: 0, version: 1, revision: 1 });
});

test('a changed institutional date is told even when a campus adjustment keeps the visible day', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-client.ts';
    const module = (await import(modulePath)) as typeof EditorFixture;
    const original = module.record.institutionalEvents[0]!;
    module.record.state.observanceDates = { 'teacher-day': '2027-10-14' };
    module.record.institutionalSnapshot = [
      {
        ...original,
        start: '2027-10-14',
        end: '2027-10-14',
        originalStart: '2027-10-15',
        originalEnd: '2027-10-15',
      },
    ];
    module.record.institutionalEvents = [
      {
        ...original,
        start: '2027-10-14',
        end: '2027-10-14',
        originalStart: '2027-10-16',
        originalEnd: '2027-10-16',
      },
    ];
    module.record.currentCatalogueRevision = 2;
    module.publish();
  });
  await expect(page.locator('#base-changes-notice')).toContainText('Alterado: ');
});
