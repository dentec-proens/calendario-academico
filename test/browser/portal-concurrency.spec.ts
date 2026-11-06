import { test, expect } from './test.ts';
import type {} from '../fixtures/portal-router-client.ts';

import type { Page } from '@playwright/test';

async function remoteCatalogue(page: Page) {
  await page.evaluate(() => {
    const current = window.portalRouterTest.catalogue;
    window.portalRouterTest.publishCatalogue({
      revision: current.revision + 1,
      events: current.events.map((event) => ({
        ...event,
        name: 'Evento atualizado por outro ADMIN',
        evidence: 'Nova fonte confirmada na outra sessão',
      })),
    });
  });
}

test('dirty institutional event keeps its original revision and cannot overwrite a remote update, even after remount', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/eventos-institucionais/synthetic-event/editar');
  await page.locator('#catalogue-name').fill('Edição local em andamento');
  await remoteCatalogue(page);
  await expect(page.locator('#catalogue-name')).toHaveValue('Edição local em andamento');
  await page.locator('[data-page="rules"]').click();
  await page.goBack();
  await expect(page.locator('#catalogue-name')).toHaveValue('Edição local em andamento');
  await page.locator('#catalogue-form button[type="submit"]').click();
  await expect(page.locator('#catalogue-form [role="alert"]')).toContainText('outra sessão');
  expect(await page.evaluate(() => window.portalRouterTest.catalogue.events[0].name)).toBe(
    'Evento atualizado por outro ADMIN',
  );
  expect(await page.evaluate(() => window.portalRouterTest.catalogue.revision)).toBe(2);
  expect(
    await page.evaluate(() => window.portalRouterTest.mutations.at(-1)?.args.body),
  ).toMatchObject({ revision: 1 });
});

test('pristine institutional event refreshes its fields and revision before another edit is saved', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/eventos-institucionais/synthetic-event/editar');
  await expect(page.locator('#catalogue-name')).toHaveValue('Evento institucional de teste');
  await remoteCatalogue(page);
  await expect(page.locator('#catalogue-name')).toHaveValue('Evento atualizado por outro ADMIN');
  await expect(page.locator('#catalogue-evidence')).toHaveValue(
    'Nova fonte confirmada na outra sessão',
  );
  await page.locator('#catalogue-name').fill('Edição baseada na versão atual');
  await page.locator('#catalogue-form button[type="submit"]').click();
  await expect(page).toHaveURL(origin + '/eventos-institucionais');
  expect(await page.evaluate(() => window.portalRouterTest.catalogue.events[0])).toMatchObject({
    name: 'Edição baseada na versão atual',
    evidence: 'Nova fonte confirmada na outra sessão',
  });
  expect(
    await page.evaluate(() => window.portalRouterTest.mutations.at(-1)?.args.body),
  ).toMatchObject({ revision: 2 });
});

test('dirty account profile keeps its original expected role and campus when another ADMIN changes the member', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/contas');
  const row = page
    .locator('#user-list li')
    .filter({ has: page.locator('[data-remove-member="user-campus"]') });
  await row.locator('.member-role-editor select').first().selectOption('ADMIN');
  await page.evaluate(() => {
    const member = window.portalRouterTest.members.find((item) => item.id === 'user-campus')!;
    window.portalRouterTest.publishMember({ ...member, role: 'PARECERISTA', campusId: null });
  });
  await row.locator('.member-role-editor button[type="submit"]').click();
  await expect(row.locator('.member-role-editor [role="alert"]')).toContainText('outra sessão');
  expect(
    await page.evaluate(() => window.portalRouterTest.mutations.at(-1)?.args.expected),
  ).toEqual({ role: 'CAMPUS', campusId: 'campus-a' });
  expect(
    await page.evaluate(
      () => window.portalRouterTest.members.find((member) => member.id === 'user-campus')?.role,
    ),
  ).toBe('PARECERISTA');
  await expect(row.locator('.member-role-editor select').first()).toHaveValue('ADMIN');
});

test('pristine account profile refreshes when the member is changed remotely', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/contas');
  const row = page
    .locator('#user-list li')
    .filter({ has: page.locator('[data-remove-member="user-campus"]') });
  await expect(row.locator('.member-role-editor select').first()).toHaveValue('CAMPUS');
  await page.evaluate(() => {
    const member = window.portalRouterTest.members.find((item) => item.id === 'user-campus')!;
    window.portalRouterTest.publishMember({ ...member, role: 'PARECERISTA', campusId: null });
  });
  await expect(row.locator('.member-role-editor select').first()).toHaveValue('PARECERISTA');
  await expect(row.locator('.member-role-editor button[type="submit"]')).toBeDisabled();
});
