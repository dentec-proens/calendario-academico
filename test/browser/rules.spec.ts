import { test, expect } from './test.ts';

for (const role of ['ADMIN', 'CAMPUS', 'PARECERISTA'] as const)
  test(`${role} reads the current calendar rules from the shared menu`, async ({
    page,
    fixtureServer,
  }) => {
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(`${origin}/documentos?role=${role}`);
    const link = page.locator('.shared-navigation [data-page="rules"]');
    await expect(link).toHaveText('Regras do calendário');
    await link.click();
    await expect(page).toHaveURL(/\/regras/);
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#panel-title')).toHaveText('Regras do calendário');
    await expect(page.locator('#rules-title')).toHaveText('Regras do calendário de 2027');
    await expect(page.locator('.rules-summary')).toContainText('consup-292-2027-v3');
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
    await expect(page.locator('.rules-history')).toContainText('Dispensa exigência');
  });
