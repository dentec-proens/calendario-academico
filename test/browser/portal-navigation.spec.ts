import { test, expect } from './test.ts';

for (const width of [1440, 390]) {
  test(`collection opening preserves a control selected before the deferred heading focus at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('portal'));
    await expect(page.locator('#calendar-list')).toBeVisible();
    await page.clock.install();
    await page.clock.pauseAt(new Date());

    const open = page.getByRole('button', { name: 'Novo calendário' });
    const heading = page.getByRole('heading', { name: 'Criar calendário', exact: true });
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(heading).toBeVisible();
    await page.clock.runFor(32);
    await expect(heading).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#calendar-campus')).toBeFocused();

    await page.getByRole('button', { name: 'Voltar à lista' }).click();
    await open.focus();
    await page.keyboard.press('Enter');
    const offer = page.getByLabel('Técnico subsequente');
    await offer.check();
    await page.clock.runFor(32);
    await expect(offer).toBeFocused();
    await page.keyboard.press('Space');
    await expect(offer).not.toBeChecked();
  });
}

test('calendar creation asks for year and offers and previews the draft name', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios?role=CAMPUS');
  await expect(page.locator('.calendar-list')).toHaveAttribute('data-view', 'gallery');
  await expect(page.locator('#calendar-list')).toContainText('Criado por: Pessoa autora');
  await expect(page.locator('#calendar-list')).toContainText(
    'Última alteração por: Pessoa editora',
  );
  const card = page.locator('#calendar-list > li[data-calendar-campus]').first();
  await expect(card.locator('.calendar-list-offering')).toContainText('Técnico integrado');
  await expect(card.locator('.calendar-list-courses')).not.toBeEmpty();
  const coursePosition = await card.locator('.calendar-list-courses').boundingBox();
  const authorshipPosition = await card.locator('.calendar-list-authorship').boundingBox();
  expect(coursePosition).not.toBeNull();
  expect(authorshipPosition).not.toBeNull();
  expect(authorshipPosition!.y).toBeGreaterThan(coursePosition!.y + coursePosition!.height);

  // Profiles that oversee every campus scan the same calendars as aligned table rows.
  await page.goto(origin + '/calendarios');
  await expect(page.locator('.calendar-list')).toHaveAttribute('data-view', 'table');
  await expect(page.locator('.calendar-list-heading')).toBeVisible();
  const row = page.locator('#calendar-list > li[data-calendar-campus]').first();
  await expect(row.locator('.calendar-list-authorship')).toContainText('por Pessoa editora');
  const statusPosition = await row.locator('.calendar-list-status').boundingBox();
  const namePosition = await row.locator('.calendar-list-name').boundingBox();
  expect(statusPosition!.x).toBeGreaterThan(namePosition!.x + namePosition!.width);
  await expect(row.getByRole('button', { name: 'Excluir calendário' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  const name = page.getByLabel('Nome do calendário', { exact: true });
  await expect(name).toHaveJSProperty('tagName', 'OUTPUT');
  await expect(name).toHaveText('Calendário 2027 - Campus Campus de teste');
  await expect(page.locator('#calendar-year-help')).toHaveCount(0);
  await page.locator('#calendar-year [data-choice="2028"]').click();
  await expect(name).toHaveText('Calendário 2028 - Campus Campus de teste');
  await expect(page.locator('#calendar-year-help')).toContainText(
    'Ainda não há norma configurada para 2028',
  );
  await expect(page.locator('#calendar-year-other')).toHaveCount(0);
  await page.locator('#calendar-year [data-choice="outro"]').click();
  await expect(page.locator('#calendar-year-other')).toHaveValue('2028');
  await page.locator('#calendar-year-other').fill('2031');
  await expect(name).toHaveText('Calendário 2031 - Campus Campus de teste');
  await page.locator('#calendar-year [data-choice="2027"]').click();
  await expect(page.locator('#calendar-year-other')).toHaveCount(0);
  await expect(name).toHaveText('Calendário 2027 - Campus Campus de teste');
  await expect(page.locator('#calendar-year-help')).toHaveCount(0);
  const summary = page.locator('#calendar-offer-summary');
  await expect(summary).toHaveText('Nenhuma oferta marcada · começa como rascunho');
  await page.getByRole('button', { name: 'Criar rascunho' }).click();
  await expect(page.locator('#create-calendar .form-feedback')).toContainText(
    'Marque ao menos uma oferta.',
  );
  await page.getByLabel('Graduação', { exact: true }).check();
  await page.getByLabel('Técnico integrado').check();
  await expect(page.locator('#calendar-offer-integrado-organization [role="radio"]')).toHaveCount(
    2,
  );
  await page.locator('#calendar-offer-integrado-organization [data-choice="semestral"]').click();
  await expect(summary).toHaveText(
    'Técnico integrado (semestral) + Graduação (anual) · começa como rascunho',
  );
  await page.getByLabel('Graduação', { exact: true }).uncheck();
  await expect(page.locator('#calendar-offer-graduacao-organization')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar rascunho' })).toBeVisible();
  await page.locator('[data-page="accounts"]').click();
});

test('portal shares each subject across roles while preserving drafts, scoped controls, history and mobile menus', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('portal');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const origin = new URL(fixtureUrl).origin;
  await page.goto(origin + '/calendarios');
  await expect(page.locator('#calendar-list'))
    .toBeVisible()
    .catch((error: unknown) => {
      throw new Error(JSON.stringify(errors), { cause: error });
    });
  await expect(page.locator('[data-page="institution-events"]')).toHaveCount(1);
  await expect(page.locator('[data-page="manage-events"]')).toHaveCount(0);
  await expect(page.locator('.portal-sidebar')).not.toContainText(/Todos os campi/);
  await expect(page.locator('#create-calendar')).toBeHidden();
  await page.locator('#calendars .collection-heading button').click();
  await expect(page.locator('#create-calendar')).toBeVisible();
  expect(
    await page
      .locator('#calendar-offers')
      .evaluate(
        (node) =>
          node.getBoundingClientRect().top >
          document.querySelector('#calendar-year')!.getBoundingClientRect().bottom - 1,
      ),
    'offers have their own group below the year',
  ).toBeTruthy();
  for (const selector of ['#calendar-campus']) {
    const label = await page.locator(selector).evaluate((node) => {
      const label = node.closest('label')!;
      const style = getComputedStyle(label);
      return {
        weight: style.fontWeight,
        align: style.alignItems,
        textAlign: style.textAlign,
        gap: style.gap,
        left: label.getBoundingClientRect().left,
        controlLeft: node.getBoundingClientRect().left,
      };
    });
    expect({
      weight: label.weight,
      align: label.align,
      textAlign: label.textAlign,
      gap: label.gap,
    }).toEqual({ weight: '600', align: 'stretch', textAlign: 'left', gap: '8px' });
    expect(Math.abs(label.left - label.controlLeft) < 1).toBeTruthy();
  }
  await page.locator('#calendar-offer-integrado').check();
  const offerLayout = await page
    .locator('[data-create-offer]')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
  expect(offerLayout.length).toBe(4);
  expect(
    Math.abs(offerLayout[0].top - offerLayout[1].top) < 1 &&
      offerLayout[2].top > offerLayout[0].bottom - 1,
    'offers form two columns on desktop',
  ).toBe(true);
  expect(
    offerLayout[1].height < offerLayout[0].height,
    'an unmarked offer keeps its own height beside a marked one',
  ).toBe(true);
  expect(
    await page
      .locator('#create-calendar')
      .evaluate((node) => new FormData(node as HTMLFormElement).getAll('calendar-offer')),
    'each marked offer remains a named successful control',
  ).toEqual(['integrado']);
  await page.locator('[data-page="accounts"]').click();
  await expect(page.locator('#user-list')).toBeVisible();
  await expect(page.locator('#campus-list')).toBeHidden();
  await expect(page.locator('#user-form')).toBeHidden();
  const ownRoleForm = '#user-list > li:first-child form';
  await expect(page.locator(`${ownRoleForm} button`)).toBeDisabled();
  expect(
    await page
      .locator(`${ownRoleForm} button`)
      .evaluate((node) => node.classList.contains('ui-button--secondary')),
  ).toBeTruthy();
  await expect(page.locator('.account-list-heading')).toHaveCount(1);
  await page.selectOption(`${ownRoleForm} select`, 'CAMPUS');
  await expect(
    page.locator(`${ownRoleForm} select[aria-label="Campus de Pessoa de teste"]`),
  ).toBeVisible();
  await expect(page.locator(`${ownRoleForm} button`)).toBeEnabled();
  expect(
    await page
      .locator(`${ownRoleForm} button`)
      .evaluate((node) => node.classList.contains('ui-button--primary')),
  ).toBeTruthy();
  for (const width of [1720, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator('#user-list > li').evaluateAll((rows) =>
      rows.map((row) => {
        const bounds = row.getBoundingClientRect();
        const controls = [row.querySelector('select')!, ...row.querySelectorAll('button')];
        const controlBounds = controls.map((control) => control.getBoundingClientRect());
        return {
          name: row.querySelector('strong')!.textContent,
          width: bounds.width,
          columns: ['.member-role-editor', '.account-recovery', '.account-removal'].map(
            (selector) => {
              const cell = row.querySelector(selector)!;
              return cell.childElementCount ? cell.getBoundingClientRect().left : null;
            },
          ),
          repeatedLabelVisible:
            getComputedStyle(row.querySelector('.member-role-label')!).display !== 'none',
          oneLine: controlBounds.every(
            (rect) => Math.abs(rect.bottom - controlBounds[0].bottom) < 2,
          ),
          identityAlongside:
            row.querySelector('strong')!.getBoundingClientRect().bottom >
            Math.min(...controlBounds.map((rect) => rect.top)),
          buttons: Array.from(row.querySelectorAll('button')).map((button) => ({
            text: button.textContent,
            height: button.getBoundingClientRect().height,
          })),
          fits: Array.from(row.querySelectorAll('button, select')).every((control) => {
            const rect = control.getBoundingClientRect();
            return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
          }),
        };
      }),
    );
    const headings = await page
      .locator('.account-list-heading > span')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
    for (const row of layout) {
      expect(row.fits, `${row.name}: controls fit the account row at ${width}px`).toBeTruthy();
      if (row.width >= 960) {
        expect(
          row.oneLine,
          `${row.name}: profile and actions share one line when there is room`,
        ).toBeTruthy();
        expect(
          row.identityAlongside,
          `${row.name}: identity stays alongside the controls`,
        ).toBeTruthy();
        expect(row.repeatedLabelVisible, 'desktop uses the shared profile heading').toBe(false);
        row.columns.forEach((left, index) => {
          if (left !== null)
            expect(
              Math.abs(left - headings[index + 1]) < 1,
              `${row.name}: column ${index + 1} aligns with its heading at ${width}px`,
            ).toBeTruthy();
        });
      } else {
        expect(row.repeatedLabelVisible, 'stacked fields keep their visible labels').toBeTruthy();
      }
      for (const button of row.buttons) {
        expect(
          button.height >= 44 && button.height <= 64,
          `${row.name}: ${button.text} keeps its natural touch-target height at ${width}px (got ${button.height}px)`,
        ).toBeTruthy();
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `accounts fit at ${width}px`,
    ).toBeTruthy();
  }
  await page.locator(`${ownRoleForm} select`).first().selectOption('ADMIN');
  await expect(page.locator(`${ownRoleForm} select`)).toHaveCount(1);
  await expect(page.locator(`${ownRoleForm} button`)).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#accounts .collection-heading button').click();
  await expect(page.locator('#user-role option')).toHaveText([
    'Campus · Apenas sua unidade',
    'Admin · Acesso completo',
    'Parecerista · Revisões e pareceres',
  ]);
  await expect(page.locator('#create-user-button')).toHaveText('Criar conta Campus');
  expect(
    await page
      .locator('#user-name')
      .evaluate((node) => getComputedStyle(node.closest('label')!).fontWeight),
  ).toBe('600');
  await page.locator('#user-name').fill('Nome ainda não enviado');
  await page.locator('[data-page="campuses"]').click();
  await expect(page.locator('#campus-list')).toBeVisible();
  await expect(page.locator('#user-list')).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/campi');
  await page.goBack();
  await expect(page.locator('#user-form')).toBeVisible();
  await expect(page.locator('input#user-name')).toHaveValue('Nome ainda não enviado');
  await page.locator('[data-page="calendars"]').click();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page.locator('#calendar-offer-integrado')).toBeChecked();
  await page.locator('[data-page="institution-events"]').click();
  await page.locator('[data-edit="synthetic-event"]').click();
  expect(
    await page
      .locator('#catalogue-name')
      .evaluate((node) => getComputedStyle(node.closest('label')!).fontWeight),
  ).toBe('600');
  await page.locator('#catalogue-name').fill('Evento em edição');
  await page.locator('[data-page="rules"]').click();
  await expect(page.locator('#catalogue-form')).toBeHidden();
  await page.locator('[data-page="institution-events"]').click();
  await page.locator('[data-edit="synthetic-event"]').click();
  await expect(page.locator('input#catalogue-name')).toHaveValue('Evento em edição');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.portal-sidebar')).toBeHidden();
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('.portal-sidebar')).toBeVisible();
  await page.locator('[data-page="campuses"]').click();
  await expect(page.locator('.portal-sidebar')).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();

  await page.locator('.sidebar-toggle').click();
  await page.locator('[data-page="calendars"]').click();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `calendar form fits at ${width}px`,
    ).toBeTruthy();
  }
  const mobileLayout = await page
    .locator('[data-create-offer]')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
  expect(
    mobileLayout.length === 4 && mobileLayout.every((left) => Math.abs(left - mobileLayout[0]) < 1),
    'offers stack in one column on mobile',
  ).toBeTruthy();

  await page.goto(origin + '/contas?role=CAMPUS');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expect(page.locator('.admin-navigation')).toHaveCount(0);
  await expect(page.locator('#user-form')).toHaveCount(0);
  await expect(page.locator('#campus-filter')).toHaveCount(0);
  await expect(page.locator('#catalogue-form')).toHaveCount(0);
  await page.locator('.sidebar-toggle').click();
  await page.goto(origin + '/eventos-institucionais?role=CAMPUS');
  await expect(page.locator('#catalogue-list')).toBeVisible();
  await expect(page.locator('[data-edit="synthetic-event"]')).toHaveCount(0);
  await page.goto(origin + '/contas?role=PARECERISTA');
  await expect(page.locator('#review-panel')).toBeVisible();
  await expect(page.locator('[data-page="accounts"]')).toHaveCount(0);
  await expect(page.locator('[data-page="campuses"]')).toHaveCount(0);
  await expect(page.locator('[data-page="calendars"]')).toHaveCount(0);
  await expect(page.locator('#create-calendar')).toHaveCount(0);
  await expect(page.locator('#user-form')).toHaveCount(0);
  expect(await page.locator('[data-open-review]').first().count()).toBeTruthy();
  await page.goto(origin + '/calendarios?role=PARECERISTA');
  await expect(page.locator('#review-panel')).toBeVisible();
  expect(errors).toEqual([]);
});
