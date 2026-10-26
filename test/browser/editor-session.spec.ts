import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import type {} from '../fixtures/editor-session-client.ts';

async function editAppliedEvent(page: Page, name = 'Evento aplicado sem confirmação') {
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-edit-event="local-event"]').click();
  await page.locator('#event-name').fill(name);
  await page.locator('#event-confirmed').check();
  await page.getByRole('button', { name: 'Aplicar alterações do evento', exact: true }).click();
  await expect(page.locator('#message')).toContainText(name);
}

test('portal logout redirects to the access form without an active editor recovery', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor-session', cleanup));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.locator('.portal-back').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.locator('#account')).toHaveText('Portal PROENS');
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  await expect(page).toHaveURL(/\/?\?retorno=%2Fcalendarios$/);
});

test('a new login in the same tab protects the editor on its next expiration', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor-session', cleanup));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  await page.locator('#email').fill('editor@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#record-title')).toBeVisible();
  await editAppliedEvent(page, 'Alteração da nova sessão de acesso');
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(page.locator('#editor-session-expired')).toBeVisible();
  await expect(page.locator('#event-name')).toHaveValue('Alteração da nova sessão de acesso');
});

test('header logout can be cancelled and waits for an in-flight save before sign-out', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor-session', cleanup));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.holdSaves());
  await editAppliedEvent(page);
  await page.locator('#event-name').fill('Campo não aplicado');
  await page.locator('#logout').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Os campos ainda não aplicados serão descartados');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#event-name')).toHaveValue('Campo não aplicado');
  expect(await page.evaluate(() => window.editorSessionTest.counters.signOuts)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.editorSessionTest.counters.saveStarted))
    .toBe(1);
  await page.locator('#logout').click();
  await dialog.getByRole('button', { name: 'Salvar e sair', exact: true }).click();
  await expect(dialog).toContainText('Salvando');
  expect(await page.evaluate(() => window.editorSessionTest.counters.signOuts)).toBe(0);
  await page.evaluate(() => window.editorSessionTest.releaseSaves());
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  expect(await page.evaluate(() => window.editorSessionTest.counters.signOuts)).toBe(1);
  expect(await page.evaluate(() => window.editorTest.record.state.events[0].name)).toBe(
    'Evento aplicado sem confirmação',
  );
});

test('expired editor keeps applied data for a local copy and same-account reauthentication', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor-session', cleanup));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.holdSaves());
  await editAppliedEvent(page, 'Evento preservado após expiração');
  await page.locator('#event-name').fill('Rascunho também preservado');
  await expect
    .poll(() => page.evaluate(() => window.editorSessionTest.counters.saveStarted))
    .toBe(1);
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(page.locator('#editor-session-expired')).toBeVisible();
  await expect(page.locator('#event-name')).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#expired-editor-copy').click();
  const download = await downloadPromise;
  const state = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    events: Array<{ name: string }>;
  };
  expect(state.events[0].name).toBe('Evento preservado após expiração');
  await page.locator('#expired-editor-login').click();
  await page.locator('#email').fill('editor@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#editor-session-expired')).toHaveCount(0);
  await expect(page.locator('#event-name')).toHaveValue('Rascunho também preservado');
  await expect(page.locator('#event-name')).toBeEnabled();
  await page.evaluate(() => window.editorSessionTest.releaseSaves());
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.events[0].name))
    .toBe('Evento preservado após expiração');
});

test('expired editor requires explicit discard and never carries local changes to a different identity', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor-session', cleanup));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.holdSaves());
  await editAppliedEvent(page, 'Alteração exclusiva da primeira conta');
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(page.locator('#editor-session-expired')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.switchUser('another-user', 'PARECERISTA'));
  await expect(page.locator('#editor-session-expired')).toHaveCount(0);
  await expect(page.locator('#event-name')).not.toHaveValue(
    'Alteração exclusiva da primeira conta',
  );
  await expect(page.locator('#event-list')).not.toContainText(
    'Alteração exclusiva da primeira conta',
  );
  await page.evaluate(() => window.editorSessionTest.expire());
  await page.locator('#expired-editor-discard').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#record-title')).toBeVisible();
  await page.locator('#expired-editor-discard').click();
  await dialog.getByRole('button', { name: 'Descartar e ir para acesso', exact: true }).click();
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  await expect(page.locator('#record-title')).toHaveCount(0);
});
