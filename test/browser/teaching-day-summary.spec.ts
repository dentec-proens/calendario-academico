import { test, expect } from './test.ts';
import { addPeriod, selectEditorSection, savedState } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`teaching days remain visible across steps and applied Saturday changes at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(await fixtureServer('editor'));
    const summary = page.locator('.teaching-day-summary');
    const toggle = summary.locator('summary');
    await expect(summary).toContainText('A definir');
    await addPeriod(page, '2027-03-01', '2027-04-30');
    await savedState(page);
    await expect(summary.locator('.teaching-day-current strong')).toHaveText('45 dias');
    await expect(summary).toHaveAttribute('data-tone', 'neutral');
    await toggle.focus();
    await page.keyboard.press('Enter');
    const details = page.getByRole('region', { name: 'Dias letivos por oferta e período' });
    await expect(details).toContainText('Total no ano');
    await expect(details).toContainText('Ano letivo');
    await expect(details).toContainText('Sem referência normativa configurada');
    await expect(details).not.toContainText('Contagem dos dados aplicados');
    await details.getByRole('button', { name: 'Fechar detalhes' }).focus();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(toggle).toBeFocused();

    for (const section of [
      'edit',
      'periods',
      'days',
      'vacations',
      'events',
      'issues',
      'calendar',
    ] as const) {
      await selectEditorSection(page, section);
      await page.locator('.editor-step-footer').scrollIntoViewIfNeeded();
      await expect(toggle).toBeInViewport({ ratio: 1 });
      expect(
        await toggle.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
          );
        }),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }

    await selectEditorSection(page, 'days');
    await page.locator('#saturday-dates input[value="2027-03-06"]').check();
    if (width === 390) await page.locator('#saturday-open-panel').click();
    await expect(page.locator('#saturday-day-count')).toHaveCount(0);
    await expect(summary.locator('.teaching-day-current strong')).toHaveText('45 dias');
    await page.locator('#saturday-name').fill('Reposição');

    await page.locator('#saturday-submit').click();
    await expect(summary.locator('.teaching-day-current strong')).toHaveText('46 dias');
    await selectEditorSection(page, 'issues');
    await page.locator('#calendar-scope-integrado').selectOption('covered');

    await page.locator('#scope-form-integrado button[type="submit"]').click();
    await expect(summary.locator('.teaching-day-current strong')).toHaveText('46 / 200');
    await expect(summary.locator('.teaching-day-status')).toHaveText('Faltam 154 dias');
    await expect(summary).toHaveAttribute('data-tone', 'warning');
  });
}

for (const width of [1440, 390]) {
  test(`details distinguish offers, semester references, missing periods and attained annual references at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(() => {
      const { record } = window.editorTest;
      record.offerKinds = ['integrado', 'graduacao', 'posgraduacao'];
      record.state.offers = record.offerKinds.map((kind) => ({
        id: kind,
        kind,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      }));
      record.state.offers = record.state.offers.map((offer) => ({
        ...offer,
        organization:
          offer.id === 'integrado'
            ? ('anual' as const)
            : offer.id === 'graduacao'
              ? ('semestral' as const)
              : offer.id === 'posgraduacao'
                ? ('anual' as const)
                : ('a-classificar' as const),
      }));
      record.state.offers = record.state.offers.map((offer) => ({
        ...offer,
        scope: offer.kind === 'posgraduacao' ? undefined : { status: 'covered' as const },
      }));
      record.state.periods = [
        {
          id: 'annual',
          name: 'Ano integrado',
          start: '2027-01-04',
          end: '2027-12-23',
          association: { status: 'defined', offers: ['integrado'], term: 'annual' },
        },
        {
          id: 'first-grad',
          name: '1º semestre',
          start: '2027-03-01',
          end: '2027-04-30',
          association: { status: 'defined', offers: ['graduacao'], term: 'first' },
        },
        {
          id: 'second-grad',
          name: '2º semestre',
          start: '2027-08-02',
          end: '2027-08-31',
          association: { status: 'defined', offers: ['graduacao'], term: 'second' },
        },
      ];
      record.version++;
      return window.publishReviewerCalendar();
    });
    const summary = page.locator('.teaching-day-summary');
    await expect(summary.locator('.teaching-day-current')).toHaveCount(3);
    for (const offer of await summary.locator('.teaching-day-current').all())
      await expect(offer).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(summary.locator('.teaching-day-offers')).toContainText('Pós-graduação');
    await expect(summary.locator('.teaching-day-offers')).toContainText('67 / 200');
    await summary.locator('summary').click();
    const details = page.getByRole('region', { name: 'Dias letivos por oferta e período' });
    const integrated = details.getByRole('region', { name: 'Técnico integrado', exact: true });
    await expect(integrated).toContainText('dias acima da referência');
    await expect(integrated.locator('dl > div').nth(1)).toContainText(
      'Sem referência normativa configurada',
    );
    await expect(integrated.locator('dl > div').nth(1)).not.toContainText('/ 200');
    const degree = details.getByRole('region', { name: 'Graduação', exact: true });
    await expect(degree).toContainText('67 / 200 dias');
    await expect(degree).toContainText('45 / 100 dias');
    await expect(degree).toContainText('22 / 100 dias');
    await expect(details.getByRole('region', { name: 'Pós-graduação' })).toContainText(
      'Cadastre os períodos',
    );
  });
}
