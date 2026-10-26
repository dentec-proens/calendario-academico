import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';

test('calendar creation presents the generated name as text and explains each purpose', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('portal', cleanup));
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  const name = page.getByLabel('Nome do calendário', { exact: true });
  await expect(name).toHaveJSProperty('tagName', 'OUTPUT');
  await expect(name).toHaveText('Calendário 2027 - Campus Campus de teste');
  await expect(page.getByText('Gerado automaticamente a partir do campus e do ano.')).toBeVisible();
  await page.getByLabel('Ano', { exact: true }).fill('2028');
  await expect(name).toHaveText('Calendário 2028 - Campus Campus de teste');
  await page.getByLabel('Turnos (opcional)').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByLabel('Turmas (opcional)')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByLabel('Nome dos cursos')).toBeFocused();
  await expect(page.locator('.calendar-purpose-help')).toContainText('experimentar a ferramenta');
  await expect(page.locator('.calendar-purpose-help')).toContainText('proposta para análise');
  await expect(page.locator('.calendar-purpose-help')).toContainText('revisão humana');
  await expect(page.locator('.workspace-heading')).not.toContainText(/Perfil|Todos os campi/);
  await page.locator('[data-page="accounts"]').click();
  await expect(page.locator('.workspace-heading')).not.toContainText(/Perfil|Todos os campi/);
});

test('portal shares each subject across roles while preserving drafts, scoped controls, history and mobile menus', async ({
  page,
  cleanup,
}) => {
  const fixtureUrl = await startFixtureServer('portal', cleanup);
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
  expect(await page.locator('[data-page="institution"]').evaluateAll((nodes) => nodes.length)).toBe(
    1,
  );
  await expect(page.locator('[data-page="institution-events"]')).toHaveCount(1);
  await expect(page.locator('[data-page="manage-documents"]')).toHaveCount(0);
  await expect(page.locator('[data-page="manage-events"]')).toHaveCount(0);
  await expect(page.locator('.portal-sidebar')).not.toContainText(/Todos os campi/);
  await expect(page.locator('#create-calendar')).toBeHidden();
  await page.locator('#calendars .collection-heading button').click();
  await expect(page.locator('#create-calendar')).toBeVisible();
  const identityLayout = await page
    .locator('.calendar-identity-fields :is(input, select)')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  expect(identityLayout.length).toBe(3);
  expect(
    identityLayout.every((top) => Math.abs(top - identityLayout[0]) < 1),
    'campus, year and organization align on one row',
  ).toBeTruthy();
  expect(
    await page
      .locator('#calendar-modalities')
      .evaluate(
        (node) =>
          node.getBoundingClientRect().top >
          document.querySelector('.calendar-identity-fields')!.getBoundingClientRect().bottom - 1,
      ),
    'modalities have their own group below identification',
  ).toBeTruthy();
  for (const selector of [
    '#calendar-campus',
    '#calendar-year',
    '#calendar-name',
    '#calendar-courses',
  ]) {
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
  await page.locator('#calendar-courses').fill('Curso em preenchimento');
  await page.locator('#calendar-courses').hover();
  await page.waitForFunction(() => {
    const input = document.querySelector('#calendar-courses')!;
    return (
      getComputedStyle(input.closest('label')!).color === getComputedStyle(input).borderTopColor
    );
  });
  expect(
    await page.locator('#calendar-courses').evaluate((node) => getComputedStyle(node).boxShadow),
    'hover preserves the focus highlight',
  ).not.toBe('none');
  await page.locator('input[name="calendar-modality"]').first().check();
  expect(
    await page
      .locator('#calendar-modalities .check')
      .first()
      .evaluate((node) => getComputedStyle(node).flexDirection),
  ).toBe('row');
  expect(
    await page
      .locator('#create-calendar')
      .evaluate((node) => new FormData(node as HTMLFormElement).getAll('calendar-modality').length),
    'moving the group preserves submitted modalities',
  ).toBe(1);
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
  await expect(page.locator('input#calendar-courses')).toHaveValue('Curso em preenchimento');
  await page.locator('[data-page="institution"]').click();
  await expect(page.locator('#document-status-filter')).toBeVisible();
  await expect(page.locator('#document-list')).toContainText(/Documento rascunho/);
  await page.selectOption('#document-status-filter', 'rascunho');
  await expect(page.locator('#document-list li')).toHaveCount(1);
  await page.locator('#document-year-filter').fill('2028');
  await expect(page.locator('#document-list')).toContainText('Nenhum documento encontrado');
  await page.locator('#document-year-filter').fill('');
  await page.selectOption('#document-status-filter', '');
  await page.locator('#institution .collection-heading button').click();
  expect(
    await page
      .locator('#document-title')
      .evaluate((node) => getComputedStyle(node.closest('label')!).textAlign),
  ).toBe('left');
  await page.locator('#document-title').fill('Documento em preenchimento');
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('#document-form')).toBeHidden();
  await page.locator('[data-page="institution"]').click();
  await page.getByRole('button', { name: 'Adicionar documento' }).click();
  await expect(page.locator('input#document-title')).toHaveValue('Documento em preenchimento');
  await page.locator('[data-page="institution-events"]').click();
  await page.locator('[data-edit="synthetic-event"]').click();
  expect(
    await page
      .locator('#catalogue-name')
      .evaluate((node) => getComputedStyle(node.closest('label')!).fontWeight),
  ).toBe('600');
  await page.locator('#catalogue-name').fill('Evento em edição');
  await page.locator('[data-page="institution"]').click();
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
    .locator('.calendar-identity-fields :is(input, select)')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  expect(
    mobileLayout[0] < mobileLayout[1] && mobileLayout[1] < mobileLayout[2],
    'identification fields stack on mobile',
  ).toBeTruthy();

  await page.goto(origin + '/contas?role=CAMPUS');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expect(page.locator('.admin-navigation')).toHaveCount(0);
  await expect(page.locator('#user-form')).toHaveCount(0);
  await expect(page.locator('#campus-filter')).toHaveCount(0);
  await expect(page.locator('#document-status-filter')).toHaveCount(0);
  await expect(page.locator('#document-form')).toHaveCount(0);
  await expect(page.locator('#catalogue-form')).toHaveCount(0);
  await page.locator('.sidebar-toggle').click();
  await page.locator('[data-page="institution"]').click();
  await expect(page.locator('#document-list')).toBeVisible();
  await expect(page.locator('#document-list')).not.toContainText(/Documento rascunho/);
  await expect(page.locator('#document-list')).toContainText(/Documento vigente/);
  await page.goto(origin + '/documentos');
  await expect(page.locator('#document-status-filter')).toBeVisible();
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
  expect(await page.locator('#open-review').count()).toBeTruthy();
  await page.goto(origin + '/calendarios?role=PARECERISTA');
  await expect(page.locator('#review-panel')).toBeVisible();
  await page.goto(origin + '/documentos?role=PARECERISTA');
  await expect(page.locator('#document-list')).toBeVisible();
  await expect(page.locator('#document-form')).toHaveCount(0);
  await expect(page.locator('#document-list')).not.toContainText(/Documento rascunho/);
  expect(errors).toEqual([]);
});
