import { test, expect } from './test.ts';

for (const role of ['ADMIN', 'CAMPUS', 'PARECERISTA'] as const)
  test(`${role} reads the current calendar rules from the shared menu`, async ({
    page,
    fixtureServer,
  }) => {
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(`${origin}/eventos-institucionais?role=${role}`);
    const link = page.locator('.shared-navigation [data-page="rules"]');
    await expect(link).toHaveText('Regras do calendário');
    await link.click();
    await expect(page).toHaveURL(/\/regras/);
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#panel-title')).toHaveText('Regras do calendário');
    await expect(page.locator('#rules-title')).toHaveText('Regras do calendário de 2027');
    await expect(page.locator('.rules-summary')).toContainText('consup-292-2027-v10');
    await expect(
      page.locator('.rules-summary').getByRole('link', { name: 'Abrir publicação oficial' }),
    ).toHaveAttribute('href', /sei\.ifpr\.edu\.br.*id_documento=4606058/);
    await expect(page.locator('[data-observance-rule="public-servant-day"]')).toContainText(
      '28 out, 29 out',
    );
    const family = page.locator('[data-rule="family-meeting"]');
    await expect(family).toContainText('Decisão: exigida apenas no técnico integrado');
    await expect(family.locator('[data-offer="integrado"]')).toContainText('Obrigatória');
    await expect(family.locator('[data-offer="subsequente"]')).toContainText(
      'OpcionalExigida apenas para o integrado; cadastro permitido.',
    );
    await expect(family.locator('[data-offer="posgraduacao"]')).toHaveText(
      'Pós-graduaçãoNorma própria',
    );
    await expect(page.locator('[data-rule="registration"] [data-offer="graduacao"]')).toContainText(
      'Conforme ingresso',
    );
    await expect(page.locator('.rules-history')).toContainText('Flexibiliza as regras');
    // Art. 5º: activities without students never add a day; the rule is what tells rows apart.
    await expect(page.locator('#rules-school-day-title')).toHaveText('O que conta como dia letivo');
    await expect(page.locator('.rules-school-day')).toContainText('Art. 5º, parágrafo único');
    await expect(page.locator('[data-rule="council"] th')).toContainText(
      'Não constitui dia letivo.',
    );
    await expect(page.locator('[data-rule="campus-events"] th')).not.toContainText(
      'Não constitui dia letivo.',
    );
  });
