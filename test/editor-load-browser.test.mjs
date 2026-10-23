import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createTestApp } from './helpers/database.mjs';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
  .filter(Boolean)
  .find(existsSync);

test(
  'editor autosaves applied actions in order without changing consulted records or unapplied forms',
  { skip: !executablePath && 'Chrome/Chromium unavailable.', timeout: 90_000 },
  async (t) => {
    const app = await createTestApp(t, { setupCode: 'synthetic-editor-load' });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => app.server.close(resolve)));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    let cookie = '';

    async function call(path, method = 'GET', body) {
      const response = await fetch(base + path, {
        method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Dentec-Request': '1' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      const result = await response.json();
      assert(response.ok, JSON.stringify(result));
      return result;
    }

    const credentials = {
      email: 'editor-load@ifpr.edu.br',
      password: 'synthetic-editor-load-password',
    };
    await call('/api/setup', 'POST', {
      ...credentials,
      code: 'synthetic-editor-load',
      name: 'Synthetic editor user',
    });
    await call('/api/login', 'POST', credentials);
    const { campuses } = await call('/api/bootstrap');
    const created = await call('/api/calendars', 'POST', {
      campusId: campuses[0].id,
      year: 2027,
      modalities: ['integrado'],
      regime: 'misto',
      purpose: 'test',
      courses: 'Synthetic load regression',
    });
    // An older saved record may not match the current calculation rules. Reading
    // it must preserve the approved dates, regardless of today's derived results.
    await app.store.change((db) => {
      const record = db.calendars.find((c) => c.id === created.id);
      Object.assign(record.state, {
        weekdays: [1, 2, 3, 4, 5],
        weekConfirmed: true,
        weekEvidence: 'Synthetic source',
        assessmentStages: 2,
        periods: [
          {
            id: 'first',
            name: 'Synthetic first period',
            start: '2027-03-01',
            end: '2027-03-04',
            targetDays: 5,
          },
          {
            id: 'second',
            name: 'Synthetic second period',
            start: '2027-04-01',
            end: '2027-04-02',
            targetDays: 5,
          },
        ],
        events: [
          {
            id: 'stage-first',
            name: 'Synthetic first assessment',
            start: '2027-03-02',
            end: '2027-03-04',
            kind: 'note',
            category: 'limite',
            evidence: 'Synthetic source',
            requirementId: 'stage-1',
            assessmentAutoStart: '2027-03-01',
          },
          {
            id: 'stage-second',
            name: 'Synthetic second assessment',
            start: '2027-04-02',
            end: '2027-04-02',
            kind: 'note',
            category: 'limite',
            evidence: 'Synthetic source',
            requirementId: 'stage-2',
            assessmentAutoStart: '2027-03-01',
          },
        ],
      });
    });
    const original = await call('/api/calendars/' + created.id);
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    await page.setCookie({
      name: 'dentec_session',
      value: cookie.slice('dentec_session='.length),
      url: base,
      httpOnly: true,
    });
    // Advance only the autosave debounce. Browser, fetch and UI timers stay real.
    await page.evaluateOnNewDocument(() => {
      const originalSetTimeout = window.setTimeout.bind(window),
        originalClearTimeout = window.clearTimeout.bind(window);
      let nextId = -1;
      window.__pendingAutosaves = new Map();
      window.setTimeout = (callback, delay, ...args) => {
        if (delay !== 1500) return originalSetTimeout(callback, delay, ...args);
        const id = nextId--;
        window.__pendingAutosaves.set(id, () => callback(...args));
        return id;
      };
      window.clearTimeout = (id) => {
        if (!window.__pendingAutosaves.delete(id)) originalClearTimeout(id);
      };
      window.__flushAutosaves = () => {
        for (const [id, callback] of [...window.__pendingAutosaves]) {
          window.__pendingAutosaves.delete(id);
          callback();
        }
      };
    });
    const writes = [],
      errors = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT') writes.push(JSON.parse(request.postData()));
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/editor?id=' + created.id);
    await page.waitForFunction(() => document.querySelectorAll('#period-list > li').length === 2);
    assert.match(
      await page.$eval('#period-list', (element) => element.textContent),
      /04\/03\/2027/,
    );
    assert.match(
      await page.$eval('#period-list', (element) => element.textContent),
      /02\/04\/2027/,
    );
    assert.match(
      await page.$eval('#assessment-checklist', (element) => element.textContent),
      /02\/03\/2027 a 04\/03\/2027/,
    );
    assert.equal(
      await page.$eval('#server-save', (element) => element.hidden),
      true,
      'consulting a saved calendar exposes no redundant save action',
    );
    assert.equal(
      await page.evaluate(() => window.__pendingAutosaves.size),
      0,
      'opening a saved calendar never schedules a write',
    );
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), true);
    await page.locator('[data-edit-period="first"]').click();
    await page.locator('#period-days').fill('6');
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), false);
    assert.match(
      await page.$eval('#unapplied-status', (element) => element.textContent),
      /Alterações não aplicadas/,
    );
    assert.equal(
      await page.evaluate(() => window.__pendingAutosaves.size),
      0,
      'typing without Apply never schedules a write',
    );
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 0, 'consultation and an unapplied form never write a calendar');
    const consulted = await call('/api/calendars/' + created.id);
    assert.equal(consulted.version, original.version);
    assert.deepEqual(consulted.state, original.state);

    // A rejected submit cannot clear either its own draft or another form's draft.
    await page.locator('#new-event').click();
    await page.locator('#event-name').fill('Synthetic invalid draft');
    await page.locator('#event-evidence').fill('Synthetic pending source');
    await page.select('#event-kind', 'note');
    for (const [id, value] of [
      ['event-start', '2027-03-02'],
      ['event-end', '2027-03-01'],
    ])
      await page.$eval(
        '#' + id,
        (element, value) => {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        },
        value,
      );
    await page.locator('#event-confirmed').click();
    await page.locator('#event-form button').click();
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), false);
    assert.equal(
      await page.$eval('#event-name', (element) => element.value),
      'Synthetic invalid draft',
    );
    assert.equal(await page.$eval('#period-days', (element) => element.value), '6');
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 0, 'a rejected form never schedules a calendar save');
    await page.locator('#cancel-period-edit').click();
    assert.equal(
      await page.$eval('#unapplied-status', (element) => element.hidden),
      false,
      'canceling one form preserves the pending draft in the other form',
    );

    // Applying an exclusion explicitly retains automatic period/stage updates.
    await page.locator('#new-event').click();
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), true);
    await page.locator('#event-name').fill('Synthetic local exclusion');
    await page.select('#event-kind', 'exclude');
    for (const id of ['event-start', 'event-end'])
      await page.$eval('#' + id, (element) => {
        element.value = '2027-03-01';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await page.locator('#event-evidence').fill('Synthetic local decision');
    await page.locator('#event-confirmed').click();
    await page.locator('#event-form button').click();
    await page.waitForFunction(() =>
      document.querySelector('#period-list')?.textContent.includes('08/03/2027'),
    );
    assert.match(
      await page.$eval('#assessment-checklist', (element) => element.textContent),
      /01\/03\/2027 a 08\/03\/2027/,
    );
    const savedResponse = page.waitForResponse((response) => response.request().method() === 'PUT');
    assert.equal(await page.evaluate(() => window.__pendingAutosaves.size), 1);
    await page.evaluate(() => window.__flushAutosaves());
    assert((await savedResponse).ok());
    const saved = await call('/api/calendars/' + created.id);
    assert.equal(saved.state.periods[0].end, '2027-03-08');
    assert.equal(saved.state.periods[1].end, '2027-04-07');
    assert.equal(saved.state.events.find((event) => event.id === 'stage-first').end, '2027-03-08');
    assert.equal(saved.version, original.version + 1);
    assert.equal(writes.length, 1);

    await page.locator('[data-edit-period="first"]').click();
    await page.locator('#period-days').fill('6');
    await page.locator('#period-submit').click();
    await page.waitForFunction(() =>
      document.querySelector('#period-list')?.textContent.includes('09/03/2027'),
    );
    const editedResponse = page.waitForResponse(
      (response) => response.request().method() === 'PUT',
    );
    await page.evaluate(() => window.__flushAutosaves());
    assert((await editedResponse).ok());
    const edited = await call('/api/calendars/' + created.id);
    assert.equal(edited.state.periods[0].targetDays, 6);
    assert.equal(edited.state.periods[0].end, '2027-03-09');
    assert.equal(edited.state.events.find((event) => event.id === 'stage-first').end, '2027-03-09');
    assert.equal(edited.version, saved.version + 1);
    assert.equal(writes.length, 2);

    async function applyPeriodDays(id, days) {
      await page.locator(`[data-edit-period="${id}"]`).click();
      await page.locator('#period-days').fill(String(days));
      await page.locator('#period-submit').click();
    }

    async function flushAutosave() {
      const response = page.waitForResponse((response) => response.request().method() === 'PUT');
      await page.evaluate(() => window.__flushAutosaves());
      assert((await response).ok());
      await page.waitForFunction(
        () => document.querySelector('#autosave-status')?.dataset.state === 'saved',
      );
      assert.equal(await page.$eval('#server-save', (element) => element.hidden), true);
      return call('/api/calendars/' + created.id);
    }

    // Nearby applied actions share one request and one archived revision.
    await applyPeriodDays('first', 7);
    await applyPeriodDays('second', 6);
    assert.equal(
      await page.evaluate(() => window.__pendingAutosaves.size),
      1,
      'a new action replaces the pending debounce',
    );
    assert.equal(writes.length, 2, 'the batch waits for a pause');
    const grouped = await flushAutosave();
    assert.equal(grouped.version, edited.version + 1);
    assert.equal(grouped.state.periods[0].targetDays, 7);
    assert.equal(grouped.state.periods[1].targetDays, 6);
    assert.equal(writes.length, 3);

    // A further applied edit saves itself without exposing a manual save action.
    await applyPeriodDays('first', 8);
    const automatic = await flushAutosave();
    assert.equal(await page.evaluate(() => window.__pendingAutosaves.size), 0);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(automatic.version, grouped.version + 1);
    assert.equal(automatic.state.periods[0].targetDays, 8);
    assert.equal(writes.length, 4);

    // Hold one real PUT while another applied action changes the local state.
    // Even when its debounce expires, the second request must wait for the first.
    await page.setRequestInterception(true);
    let heldRequest, heldConversionRequest, resolveConversion, nextSaveFailure;
    let holdConversion = false;
    const held = new Promise((resolve) => {
      page.on('request', (request) => {
        if (request.method() === 'PUT' && nextSaveFailure) {
          const status = nextSaveFailure;
          nextSaveFailure = null;
          request.respond({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Synthetic temporary connection failure' }),
          });
        } else if (request.method() === 'PUT' && !heldRequest) {
          heldRequest = request;
          resolve();
        } else if (
          holdConversion &&
          request.method() === 'POST' &&
          request.url().endsWith('/make-definitive')
        ) {
          holdConversion = false;
          heldConversionRequest = request;
          resolveConversion();
        } else request.continue();
      });
    });
    await applyPeriodDays('first', 9);
    const firstResponse = page.waitForResponse((response) => response.request().method() === 'PUT');
    await page.evaluate(() => window.__flushAutosaves());
    await held;
    assert.equal(writes.length, 5);
    assert.equal(
      writes[4].state.periods[1].targetDays,
      6,
      'the first request has its own snapshot',
    );
    await applyPeriodDays('second', 8);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 5, 'applied edits never start a concurrent save');
    await heldRequest.continue();
    assert((await firstResponse).ok());
    await page.waitForFunction(() => window.__pendingAutosaves.size > 0);
    const serial = await flushAutosave();
    assert.equal(serial.version, automatic.version + 2);
    assert.equal(serial.state.periods[0].targetDays, 9);
    assert.equal(serial.state.periods[1].targetDays, 8);
    assert.equal(writes.length, 6);
    assert.equal(
      writes[5].version,
      automatic.version + 1,
      'the queued request uses the confirmed server version',
    );
    assert.equal(await page.evaluate(() => window.__pendingAutosaves.size), 0);

    // Converting a test calendar also changes its server version. Applied edits
    // made during that operation wait and then use the conversion's new version.
    const conversionHeld = new Promise((resolve) => {
      resolveConversion = resolve;
    });
    holdConversion = true;
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#make-definitive').click();
    await conversionHeld;
    assert.equal(await page.$eval('#server-save', (element) => element.hidden), true);
    await applyPeriodDays('first', 10);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(
      await page.evaluate(() => window.__pendingAutosaves.size),
      0,
      'conversion defers scheduling applied edits',
    );
    assert.equal(writes.length, 6, 'no autosave races the conversion request');
    const conversionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/make-definitive'),
    );
    await heldConversionRequest.continue();
    assert((await conversionResponse).ok());
    await page.waitForFunction(() => window.__pendingAutosaves.size > 0);
    const definitive = await flushAutosave();
    assert.equal(definitive.purpose, 'definitive');
    assert.equal(definitive.version, serial.version + 2);
    assert.equal(definitive.state.periods[0].targetDays, 10);
    assert.equal(definitive.state.periods[1].targetDays, 8);
    assert.equal(writes.length, 7);
    assert.equal(
      writes[6].version,
      serial.version + 1,
      'the applied edit uses the conversion version',
    );
    assert.equal(await page.evaluate(() => window.__pendingAutosaves.size), 0);

    // A transient failure keeps applied edits local and offers one explicit retry.
    nextSaveFailure = 503;
    await applyPeriodDays('first', 11);
    const failedResponse = page.waitForResponse(
      (response) => response.request().method() === 'PUT',
    );
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal((await failedResponse).status(), 503);
    await page.waitForSelector('#server-save', { visible: true });
    assert.equal(
      await page.$eval('#server-save', (element) => element.textContent.trim()),
      'Tentar novamente',
    );
    assert.match(
      await page.$eval('#autosave-status', (element) => element.textContent),
      /Não foi possível salvar/,
    );
    assert.equal((await call('/api/calendars/' + created.id)).version, definitive.version);
    await applyPeriodDays('second', 9);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 8, 'a connection error pauses automatic retries');
    const retryResponse = page.waitForResponse((response) => response.request().method() === 'PUT');
    await page.locator('#server-save').click();
    assert((await retryResponse).ok());
    await page.waitForFunction(
      () => document.querySelector('#autosave-status')?.dataset.state === 'saved',
    );
    assert.equal(await page.$eval('#server-save', (element) => element.hidden), true);
    const retried = await call('/api/calendars/' + created.id);
    assert.equal(retried.version, definitive.version + 1);
    assert.equal(retried.state.periods[0].targetDays, 11);
    assert.equal(retried.state.periods[1].targetDays, 9);
    assert.equal(writes.length, 9, 'the explicit retry writes the latest local snapshot once');

    // A real competing write must block retries instead of overwriting its version.
    const remoteState = structuredClone(retried.state);
    remoteState.periods[0].targetDays = 12;
    const competing = await call('/api/calendars/' + created.id, 'PUT', {
      version: retried.version,
      catalogueRevision: retried.currentCatalogueRevision,
      state: remoteState,
    });
    await applyPeriodDays('first', 13);
    const conflictResponse = page.waitForResponse(
      (response) => response.request().method() === 'PUT',
    );
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal((await conflictResponse).status(), 409);
    await page.waitForFunction(
      () => document.querySelector('#autosave-status')?.dataset.state === 'blocked',
    );
    assert.match(
      await page.$eval('#autosave-status', (element) => element.textContent),
      /Conflito de versões:.*Reabra o calendário/,
    );
    assert.equal(await page.$eval('#server-save', (element) => element.hidden), true);
    await applyPeriodDays('first', 14);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 10, 'conflicting edits never trigger an overwrite retry');
    const protectedRecord = await call('/api/calendars/' + created.id);
    assert.equal(protectedRecord.version, competing.version);
    assert.deepEqual(protectedRecord.state, competing.state);
    assert.equal(writes[9].state.periods[0].targetDays, 13);

    // A newer institutional revision must remain an explicit confirmation:
    // merely consulting it cannot create a calendar revision automatically.
    await app.store.change((db) => {
      db.catalogue.revision++;
    });
    page.once('dialog', (dialog) => dialog.accept());
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#period-list > li').length === 2);
    await page.waitForSelector('#server-save', { visible: true });
    assert.equal(
      await page.$eval('#server-save', (element) => element.textContent.trim()),
      'Confirmar atualização da base',
    );
    assert.equal(await page.evaluate(() => window.__pendingAutosaves.size), 0);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 10, 'consulting an outdated base never saves it automatically');
    assert.equal((await call('/api/calendars/' + created.id)).version, competing.version);
    const confirmationResponse = page.waitForResponse(
      (response) => response.request().method() === 'PUT',
    );
    await page.locator('#server-save').click();
    assert((await confirmationResponse).ok());
    await page.waitForFunction(
      () => document.querySelector('#autosave-status')?.dataset.state === 'saved',
    );
    assert.equal(await page.$eval('#server-save', (element) => element.hidden), true);
    const confirmed = await call('/api/calendars/' + created.id);
    assert.equal(confirmed.version, competing.version + 1);
    assert.equal(confirmed.catalogueRevision, confirmed.currentCatalogueRevision);
    assert.equal(writes.length, 11);

    // The teacher-day date is outside a form but still needs explicit Apply.
    const teacherDay = await page.$eval('#teacher-day-date', (element) => element.value);
    await page.locator('[data-edit-period="first"]').click();
    await page.locator('#period-days').fill('18');
    await page.$eval('#teacher-day-date', (element) => {
      element.value = '2027-09-01';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#apply-teacher-day').click();
    assert.match(
      await page.$eval('#message', (element) => element.textContent),
      /Escolha uma data na semana de 15 de outubro/,
    );
    assert.equal(await page.$eval('#teacher-day-date', (element) => element.value), '2027-09-01');
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), false);
    await page.evaluate(() => window.__flushAutosaves());
    assert.equal(writes.length, 11, 'an invalid teacher-day draft never saves');
    await page.locator('#cancel-period-edit').click();
    assert.equal(
      await page.$eval('#unapplied-status', (element) => element.hidden),
      false,
      'canceling another form keeps the teacher-day draft pending',
    );
    await page.locator('#reset-teacher-day').click();
    assert.equal(await page.$eval('#teacher-day-date', (element) => element.value), teacherDay);
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), true);
    await flushAutosave();

    // Applying that date clears only its own draft; unrelated local fields and
    // modality choices survive the resulting calendar render.
    await page.locator('[data-edit-period="first"]').click();
    await page.locator('#period-days').fill('18');
    await page.locator('#new-event').click();
    await page.locator('#event-name').fill('Synthetic modality draft');
    await page.locator('input[name="event-modality"]').click();
    await page.$eval(
      '#teacher-day-date',
      (element, value) => {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      },
      teacherDay,
    );
    await page.locator('#apply-teacher-day').click();
    assert.equal(await page.$eval('#period-days', (element) => element.value), '18');
    assert.equal(
      await page.$eval('input[name="event-modality"]', (element) => element.checked),
      false,
      'an unrelated applied action preserves unapplied modality choices',
    );
    assert.equal(
      await page.$eval('#event-name', (element) => element.value),
      'Synthetic modality draft',
    );
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), false);
    await page.locator('#cancel-period-edit').click();
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), false);
    await page.locator('#new-event').click();
    assert.equal(await page.$eval('#unapplied-status', (element) => element.hidden), true);
    const appliedTeacherDay = await flushAutosave();
    assert.equal(appliedTeacherDay.state.teacherDayDate, teacherDay);
    assert.equal(
      appliedTeacherDay.state.periods[0].targetDays,
      confirmed.state.periods[0].targetDays,
    );
    assert.deepEqual(errors, []);
  },
);
