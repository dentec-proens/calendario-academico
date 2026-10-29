import { test } from 'vitest';
import assert from 'node:assert/strict';
import { api } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';

test('calendar authorship distinguishes creation from content edits without exposing accounts', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const campus = asClient('campus-a');
  const admin = asClient('admin');
  const created = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
      courses: 'Curso sintético',
      purpose: 'test',
    },
  });
  assert.equal(created.createdByName, 'Campus A');
  assert.equal(created.updatedByName, 'Campus A');
  const saved = await admin.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: created.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: {
        ...created.state,
        events: [
          {
            id: 'content-note',
            name: 'Atividade registrada',
            kind: 'note' as const,
            start: '2027-03-01',
            end: '2027-03-01',
            offers: ['integrado' as const],
          },
        ],
      },
    },
  });
  const page = () =>
    campus.query(api.calendars.calendarPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
  const [record] = (await page()).page;
  assert.equal(record.createdByName, 'Campus A');
  assert.equal(record.updatedByName, 'Admin');
  assert.equal(JSON.stringify(record).includes('admin@ifpr.edu.br'), false);
  assert.equal(JSON.stringify(record).includes('private-invite-hash'), false);

  const unchanged = await campus.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: saved.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: saved.state,
    },
  });
  assert.equal(unchanged.unchanged, true);
  await client.run((ctx) =>
    ctx.db.insert('audit', {
      at: Date.now() + 10_000,
      actorId: ids.users['campus-a'],
      action: 'UPLOAD_HISTORY',
      target: { type: 'calendar', id: created.id },
      calendarId: created.id,
      campusId: ids.campuses.a,
    }),
  );
  await campus.mutation(api.calendars.deleteCalendar, { id: created.id, version: saved.version });
  const trash = await campus.query(api.calendars.trash, {});
  assert.equal(trash.calendars[0].updatedByName, 'Admin');
  await campus.mutation(api.calendars.restoreCalendar, { id: created.id });
  assert.equal((await page()).page[0].updatedByName, 'Admin');

  const foreign = await asClient('campus-b').query(api.calendars.calendarPage, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.equal(foreign.page.length, 0);
  await assert.rejects(
    asClient('campus-b').query(api.calendars.calendarPage, {
      campusId: ids.campuses.a,
      paginationOpts: { numItems: 10, cursor: null },
    }),
    /Registro não encontrado/,
  );

  await campus.mutation(api.calendars.makeDefinitive, { id: created.id, version: saved.version });
  await client.run((ctx) =>
    ctx.db.patch(ids.users['campus-a'], { active: false, removedAt: Date.now() }),
  );
  const bootstrap = await admin.query(api.workspace.bootstrap, {});
  assert.equal(bootstrap.calendars[0].createdByName, 'Campus A');
  assert.equal(bootstrap.calendars[0].updatedByName, 'Campus A');
});

test('legacy authorship uses recorded labels and never guesses a missing creator from an editor', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const id = await client.run((ctx) =>
    ctx.db.insert('calendars', {
      campusId: ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      purpose: 'test',
      courses: 'Calendário anterior',
      classes: '',
      shifts: '',
      version: 2,
      updatedAt: 2,
    }),
  );
  const page = () =>
    asClient('campus-a').query(api.calendars.calendarPage, {
      paginationOpts: { numItems: 10, cursor: null },
    });
  const unknown = (await page()).page[0];
  assert.equal(unknown.createdByName, undefined);
  assert.equal(unknown.updatedByName, undefined);
  await client.run((ctx) =>
    ctx.db.insert('audit', {
      at: 2,
      actorLabel: 'Responsável pela atualização anterior',
      action: 'SAVE_CALENDAR',
      target: { type: 'calendar', id },
      calendarId: id,
      campusId: ids.campuses.a,
      version: 2,
    }),
  );
  const edited = (await page()).page[0];
  assert.equal(edited.createdByName, undefined);
  assert.equal(edited.updatedByName, 'Responsável pela atualização anterior');
  await client.run((ctx) =>
    ctx.db.insert('audit', {
      at: 1,
      actorLabel: 'Autoria original preservada',
      action: 'CREATE_CALENDAR',
      target: { type: 'calendar', id },
      calendarId: id,
      campusId: ids.campuses.a,
      version: 1,
    }),
  );
  const attributed = (await page()).page[0];
  assert.equal(attributed.createdByName, 'Autoria original preservada');
  assert.equal(attributed.updatedByName, 'Responsável pela atualização anterior');
  await client.run((ctx) => ctx.db.patch(id, { version: 3, updatedAt: 3 }));
  const incompleteHistory = (await page()).page[0];
  assert.equal(incompleteHistory.createdByName, 'Autoria original preservada');
  assert.equal(
    incompleteHistory.updatedByName,
    undefined,
    'an older edit cannot identify the author of the current version',
  );
  await client.run((ctx) =>
    ctx.db.insert('audit', {
      at: 3,
      actorLabel: 'Atualização importada com data correspondente',
      action: 'SAVE_CALENDAR',
      target: { type: 'calendar', id },
      calendarId: id,
      campusId: ids.campuses.a,
    }),
  );
  assert.equal(
    (await page()).page[0].updatedByName,
    'Atualização importada com data correspondente',
  );
});
