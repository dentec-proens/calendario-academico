import { expect, test } from 'vitest';
import { api, internal } from '../convex/_generated/api.js';
import { inspectCalendar } from '../src/calendar-base/index.ts';
import { reviewCriteriaFor } from '../src/review.ts';
import { createNativeFixture } from './helpers/native-database.ts';

async function opened() {
  const fixture = await createNativeFixture({
    catalogue: {
      revision: 1,
      events: [
        {
          id: 'holiday',
          name: 'Feriado',
          start: '2027-03-02',
          end: '2027-03-02',
          kind: 'exclude',
          category: 'feriado',
          evidence: 'Portaria',
          modalities: ['integrado'],
          active: true,
        },
      ],
    },
  });
  const account = fixture.asClient('admin');
  const record = await account.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a!,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Teste',
      purpose: 'test',
    },
  });
  return { ...fixture, account, record };
}

test('equivalence sync is idempotent, scoped and preserves version, timestamp, snapshots and review evidence', async () => {
  const { client, account, record, asClient, inspect } = await opened();
  const review = await account.query(api.reviews.review, { id: record.id });
  await account.mutation(api.reviews.saveReview, {
    id: record.id,
    body: {
      revision: 0,
      calendarVersion: record.version,
      catalogueRevision: review.catalogueRevision,
      baseIdentity: review.baseIdentity,
      rulesetVersion: review.rulesetVersion,
      conclusion: '',
      entries: reviewCriteriaFor(2027).map(({ id }) => ({
        id,
        status: 'PENDENTE' as const,
        reviewed: false,
        notes: '',
      })),
    },
  });
  // An event for another offer increments this year's revision but cannot affect this calendar.
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      revision: 1,
      name: 'Outra oferta',
      start: '2027-04-01',
      end: '2027-04-01',
      kind: 'exclude',
      category: 'feriado',
      evidence: 'Norma',
      modalities: ['graduacao'],
      active: true,
    },
  });
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  expect(inspectCalendar(fresh, fresh).kind).toBe('equivalent');
  expect((await account.query(api.reviews.review, { id: record.id })).stale).toBe(false);
  // A compatible older technical revision does not block a test PDF.
  await expect(
    account.query(internal.calendars.pdfContext, {
      id: record.id,
      version: record.version,
      catalogueRevision: record.catalogueRevision,
    }),
  ).resolves.toMatchObject({ record: { version: 1 } });
  await expect(
    asClient('campus-b').mutation(api.calendars.synchronizeBase, { id: record.id, version: 1 }),
  ).rejects.toThrow('Registro não encontrado');
  const first = await account.mutation(api.calendars.synchronizeBase, {
    id: record.id,
    version: 1,
  });
  const second = await account.mutation(api.calendars.synchronizeBase, {
    id: record.id,
    version: 1,
  });
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    version: 1,
    updatedAt: record.updatedAt,
    catalogueRevision: 2,
    state: record.state,
    institutionalSnapshot: record.institutionalSnapshot,
    documentSnapshot: record.documentSnapshot,
  });
  const db = await inspect();
  expect(db.calendars[0]!.versions).toHaveLength(0);
  expect(db.reviews[0]!.catalogueRevision).toBe(1);
  expect((await account.query(api.reviews.review, { id: record.id })).stale).toBe(false);
  // Without historical content evidence, a legacy review cannot be silently carried forward.
  await client.run(async (ctx) => {
    const row = (await ctx.db.query('reviews').first())!;
    await ctx.db.patch(row._id, { baseIdentity: undefined });
  });
  expect((await account.query(api.reviews.review, { id: record.id })).stale).toBe(true);
});

test('real changes require the displayed content acceptance and events recalculate teaching-day targets atomically', async () => {
  const { account, record } = await opened();
  const initial = await account.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: 1,
      catalogueRevision: 1,
      state: {
        ...record.state,
        weekConfirmed: true,
        weekdays: [1, 2, 3, 4, 5],
        periods: [
          {
            id: 'p',
            name: 'Período',
            start: '2027-03-01',
            end: '2027-03-03',
            targetDays: 2,
            association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
          },
        ],
      },
    },
  });
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      id: 'holiday',
      revision: 1,
      name: 'Feriado',
      start: '2027-03-04',
      end: '2027-03-04',
      kind: 'exclude',
      category: 'feriado',
      evidence: 'Portaria nova',
      modalities: ['integrado'],
      active: true,
    },
  });
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  const acceptance = inspectCalendar(fresh, fresh).identity;
  await expect(
    account.mutation(api.calendars.synchronizeBase, { id: record.id, version: initial.version }),
  ).rejects.toThrow('incorpore');
  const body = {
    version: initial.version,
    catalogueRevision: fresh.currentCatalogueRevision,
    state: fresh.state,
  };
  await expect(
    account.mutation(api.calendars.saveCalendar, { id: record.id, body }),
  ).rejects.toThrow('incorpore');
  await expect(
    account.mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: { ...body, baseAcceptance: 'outdated' },
    }),
  ).rejects.toThrow('novamente');
  const saved = await account.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: { ...body, baseAcceptance: acceptance },
  });
  expect(saved.version).toBe(initial.version + 1);
  expect(saved.state.periods[0]!.end).toBe('2027-03-02');
  expect(saved.base.revision).toBe(2);
  expect(saved.base.events[0]!.start).toBe('2027-03-04');
});

test('document incorporation preserves dates, invalidates the evidenced review and archives the old references', async () => {
  const { client, account, record, inspect } = await opened();
  const support = await account.query(api.reviews.review, { id: record.id });
  await account.mutation(api.reviews.saveReview, {
    id: record.id,
    body: {
      revision: 0,
      calendarVersion: 1,
      catalogueRevision: 1,
      baseIdentity: support.baseIdentity,
      rulesetVersion: support.rulesetVersion,
      conclusion: '',
      entries: reviewCriteriaFor(2027).map(({ id }) => ({
        id,
        status: 'PENDENTE' as const,
        notes: '',
        reviewed: false,
      })),
    },
  });
  const id = await client.run((ctx) =>
    ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Nova norma',
      source: 'PROENS',
      hash: '1'.repeat(64),
      filename: 'norma.pdf',
      status: 'rascunho',
      version: 1,
      createdAt: Date.now(),
    }),
  );
  await account.mutation(api.documents.documentStatus, {
    id,
    revision: 1,
    status: 'vigente',
    confirmed: true,
  });
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  const assessment = inspectCalendar(fresh, fresh);
  expect(assessment.kind).toBe('documents');
  expect((await account.query(api.reviews.review, { id: record.id })).stale).toBe(true);
  const saved = await account.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: 1,
      catalogueRevision: 1,
      baseAcceptance: assessment.identity,
      state: fresh.state,
    },
  });
  expect(saved.state).toEqual(record.state);
  expect(saved.version).toBe(2);
  expect(saved.base.documents[0]!.id).toBe(id);
  const data = await inspect();
  expect(data.calendars[0]!.versions[0]!.documentSnapshot).toEqual([]);
  expect(data.reviews[0]!.documentSnapshot).toEqual([]);
});

test('removing Teacher Day leaves its local adjustment inspectable and permits explicit resolution', async () => {
  const { teacherDayId } = await import('../src/teacher-day.ts');
  const fixture = await createNativeFixture({
    catalogue: {
      revision: 1,
      events: [
        {
          id: teacherDayId.slice(5),
          name: 'Dia do Professor',
          start: '2027-10-15',
          end: '2027-10-15',
          kind: 'exclude',
          category: 'feriado',
          evidence: 'Norma',
          modalities: ['integrado'],
          active: true,
        },
      ],
    },
  });
  const account = fixture.asClient('admin');
  const created = await account.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a!,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Teste',
    },
  });
  const adjusted = await account.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: 1,
      catalogueRevision: 1,
      state: { ...created.state, teacherDayDate: '2027-10-14' },
    },
  });
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      id: teacherDayId.slice(5),
      revision: 1,
      name: 'Dia do Professor',
      start: '2027-10-15',
      end: '2027-10-15',
      kind: 'exclude',
      category: 'feriado',
      evidence: 'Norma',
      modalities: ['integrado'],
      active: false,
    },
  });
  const record = await account.query(api.calendars.calendar, { id: created.id });
  const assessment = inspectCalendar(record, record);
  expect(assessment.events.removed[0]!.id).toBe(teacherDayId);
  await expect(account.query(api.reviews.review, { id: created.id })).resolves.toMatchObject({
    calendar: { id: created.id },
  });
  const saved = await account.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: adjusted.version,
      catalogueRevision: record.currentCatalogueRevision,
      baseAcceptance: assessment.identity,
      state: { ...record.state, teacherDayDate: null },
    },
  });
  expect(saved.state.teacherDayDate).toBeUndefined();
  expect(saved.base.events).toEqual([]);
});

test('authorized release smoke cannot synchronize technical metadata, even through the editor mutation', async () => {
  const { client, account, record, ids } = await opened();
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      revision: 1,
      name: 'Outra oferta',
      start: '2027-04-01',
      end: '2027-04-01',
      kind: 'note',
      category: 'evento',
      evidence: 'Ata',
      modalities: ['graduacao'],
      active: true,
    },
  });
  const commit = 'a'.repeat(40);
  await client.mutation(internal.operations.pause, { commit });
  await client.mutation(internal.operations.authorizeSmoke, { commit, userId: ids.users.admin! });
  const synced = await account.mutation(api.calendars.synchronizeBase, {
    id: record.id,
    version: record.version,
  });
  expect(synced.catalogueRevision).toBe(record.catalogueRevision);
  const checked = await account.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: record.version,
      catalogueRevision: record.catalogueRevision,
      state: record.state,
      unchangedOnly: true,
    },
  });
  expect(checked.unchanged).toBe(true);
  expect((await account.query(api.calendars.calendar, { id: record.id })).catalogueRevision).toBe(
    1,
  );
  await client.mutation(internal.operations.endSmoke, { commit });
  await client.mutation(internal.operations.resume, { commit });
  const normal = await account.mutation(api.calendars.synchronizeBase, {
    id: record.id,
    version: record.version,
  });
  expect(normal).toMatchObject({
    catalogueRevision: 2,
    version: record.version,
    updatedAt: record.updatedAt,
  });
});
