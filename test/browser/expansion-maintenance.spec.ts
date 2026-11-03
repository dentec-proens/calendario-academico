import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-session-client.ts';

/**
 * Expansion of the v5 migration (plan `docs/plans/2026-11-02-atividades-e-datas.md`, section 6,
 * "Concorrência e corte"): while a catalogue row is still in v4, the session bootstrap answers the
 * maintenance unavailability (503). Already open tabs and new tabs show the maintenance UI, never
 * the access error, and resume by themselves once the bootstrap answers again.
 */
const accessError = (page: Page) =>
  page.getByRole('heading', { name: 'Não foi possível acessar o portal' });
const portalNotice = (page: Page) => page.getByText('O portal está em manutenção.');

async function expansion(page: Page, active: boolean) {
  await page.evaluate((value) => {
    window.editorSessionTest.maintenance(value);
    window.editorSessionTest.bootstrapUnavailable(value);
  }, active);
}

test('an open editor keeps its draft under the maintenance notice and resumes after the expansion', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await expansion(page, true);
  const notice = page.locator('#editor-access-notice');
  await expect(notice.getByRole('heading', { level: 2 })).toHaveText('Portal em manutenção');
  await expect(accessError(page)).toHaveCount(0);
  await expect(page.locator('#record-title')).toBeVisible();
  await expect(page.locator('#account')).toHaveText('Pessoa de teste · Admin');
  await expansion(page, false);
  await expect(notice).toHaveCount(0);
  await expect(page.locator('#record-title')).toBeVisible();
  await expect(accessError(page)).toHaveCount(0);
});

test('an open portal page keeps its content disabled under the maintenance notice', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await page.locator('.ui-back-link').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expansion(page, true);
  await expect(portalNotice(page)).toBeVisible();
  await expect(accessError(page)).toHaveCount(0);
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expect(page.locator('fieldset.app-operation-scope')).toHaveJSProperty('disabled', true);
  await expansion(page, false);
  await expect(portalNotice(page)).toHaveCount(0);
  await expect(page.locator('fieldset.app-operation-scope')).toHaveJSProperty('disabled', false);
  await expect(page.locator('#calendar-list')).toBeVisible();
});

test('a tab opened during the expansion shows the maintenance notice and loads after it', async ({
  page,
  fixtureServer,
}) => {
  await page.addInitScript(() => {
    window.editorSessionInitial = { maintenance: true, bootstrapUnavailable: true };
  });
  await page.goto(await fixtureServer('editor-session'));
  await expect(portalNotice(page)).toBeVisible();
  await expect(accessError(page)).toHaveCount(0);
  await expect(page.locator('#record-title')).toHaveCount(0);
  await expansion(page, false);
  await expect(page.locator('#record-title')).toBeVisible();
  await expect(portalNotice(page)).toHaveCount(0);
  await expect(accessError(page)).toHaveCount(0);
});
