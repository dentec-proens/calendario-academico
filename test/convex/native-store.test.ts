import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { api } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, seedCourses } from '../helpers/lifecycle.ts';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';

const createBody = {
  year: 2027,
  offers: [{ kind: 'integrado' as const, organization: 'anual' as const }],
};

test('calendar saves write only the current content and roll back stale saves atomically', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const campus = asClient('campus-a');
  const created = await campus
    .mutation(api.calendars.createCalendar, {
      body: { ...createBody, campusId: ids.campuses.a },
    })
    .then(calendarRecordDates);
  const note = (name: string) => [
    {
      id: 'content-note',
      name,
      effect: 'note' as const,
      start: '2027-03-01',
      end: '2027-03-01',
      offers: ['integrado' as const],
    },
  ];
  const saved = await campus
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: created.version,
        catalogueRevision: created.currentCatalogueRevision,
        state: { ...created.state, events: note('Atividade registrada') },
      },
    })
    .then(calendarSaveDates);
  assert.equal(saved.version, 2);
  const stored = () =>
    client.run(async (ctx) => ({
      contents: await ctx.db.query('calendarContents').collect(),
      audit: await ctx.db.query('audit').collect(),
    }));
  const before = await stored();
  assert.equal(before.contents[0].state.events[0].name, 'Atividade registrada');
  await assert.rejects(
    campus
      .mutation(api.calendars.saveCalendar, {
        id: created.id,
        body: {
          version: 1,
          catalogueRevision: created.currentCatalogueRevision,
          state: { ...created.state, events: note('Tentativa concorrente') },
        },
      })
      .then(calendarSaveDates),
    /Há versão mais recente/,
  );
  assert.deepEqual(await stored(), before, 'a stale writer cannot change content or audit');
  await campus.mutation(api.calendars.deleteCalendar, { id: created.id, version: 2 });
  await campus.mutation(api.calendars.restoreCalendar, { id: created.id, version: 2 });
  const final = await client.run(async (ctx) => ({
    calendar: await ctx.db.get(created.id),
    contents: await ctx.db.query('calendarContents').collect(),
  }));
  assert.deepEqual(final.contents, before.contents, 'trash and restore keep the content');
  assert.equal(final.calendar?.status, 'rascunho');
  assert.equal(final.calendar?.version, 2);
});

test('review saves preserve earlier authorship and rejected edits append no revision', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const campus = asClient('campus-a');
  const admin = asClient('admin');
  const created = await campus
    .mutation(api.calendars.createCalendar, {
      body: { ...createBody, campusId: ids.campuses.a },
    })
    .then(calendarRecordDates);
  await seedCourses({ client }, created.id);
  await act(campus, created.id, 'submit');
  const support = await admin.query(api.reviews.review, { id: created.id });
  const body = {
    rulesetVersion: support.rulesetVersion,
    baseIdentity: support.baseIdentity,
    submissionId: support.submission!.id,
    revision: 0,
    calendarVersion: created.version,
    catalogueRevision: support.catalogueRevision,
    conclusion: support.initialConclusion,
    entries: reviewCriteriaFor(2027).map((criterion) => ({
      id: criterion.id,
      status: 'PENDENTE' as const,
      notes: '',
      reviewed: false,
    })),
  };
  await admin.mutation(api.reviews.saveReview, { id: created.id, body });
  await admin.mutation(api.reviews.saveReview, {
    id: created.id,
    body: { ...body, revision: 1, processNumber: 'Processo sintético' },
  });
  const before = await client.run(async (ctx) => ({
    review: await ctx.db.query('reviews').first(),
    versions: await ctx.db.query('reviewVersions').collect(),
    audit: await ctx.db.query('audit').collect(),
  }));
  assert.equal(before.versions.length, 1);
  assert.equal(before.versions[0].reviewer.id, ids.users.admin);
  assert.equal(before.versions[0].reviewer.name, 'Admin');
  assert.equal(before.versions[0].revision, 1);
  await assert.rejects(
    admin.mutation(api.reviews.saveReview, { id: created.id, body }),
    /Outro revisor/,
  );
  await assert.rejects(
    campus.mutation(api.reviews.saveReview, { id: created.id, body: { ...body, revision: 2 } }),
    /Acesso exclusivo/,
  );
  const after = await client.run(async (ctx) => ({
    review: await ctx.db.query('reviews').first(),
    versions: await ctx.db.query('reviewVersions').collect(),
    audit: await ctx.db.query('audit').collect(),
  }));
  assert.deepEqual(after, before);
  await client.run((ctx) => ctx.db.patch(ids.users.admin, { active: false }));
  const archived = await client.run((ctx) => ctx.db.query('reviewVersions').first());
  assert.deepEqual(
    archived,
    before.versions[0],
    'disabling access retains the reviewer recorded in the archived revision',
  );
});

test('typed storage rejects legacy envelopes, invalid relationships and incomplete domain state', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  await assert.rejects(
    client.run((ctx) =>
      ctx.db.insert('campuses', {
        key: 'campuses:a',
        appId: 'a',
        position: 0,
        value: { data: { name: 'Forged' } },
      } as never),
    ),
    /validator|unexpected|missing|required/i,
  );
  await assert.rejects(
    client.run((ctx) =>
      ctx.db.insert('calendars', {
        year: createBody.year,
        offerKinds: createBody.offers.map((offer) => offer.kind),
        courses: 'Curso sintético',
        campusId: ids.users.admin,
        classes: '',
        shifts: '',
        version: 1,
        updatedAt: Date.now(),
      } as never),
    ),
    /id|validator|unexpected/i,
  );
  const record = await asClient('campus-a')
    .mutation(api.calendars.createCalendar, {
      body: { ...createBody, campusId: ids.campuses.a },
    })
    .then(calendarRecordDates);
  await assert.rejects(
    client.run((ctx) =>
      ctx.db.insert('calendarContents', {
        calendarId: record.id,
        state: { events: [] },
        catalogueRevision: 1,
        institutionalSnapshot: [],
        documentSnapshot: [],
      } as never),
    ),
    /validator|missing|required/i,
  );
  const row = await client.run((ctx) => ctx.db.get(record.id));
  assert(row);
  for (const key of ['appId', 'key', 'value', 'position', 'offer', 'schemaVersion'])
    assert(!(key in row));
  const content = await client.run((ctx) =>
    ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique(),
  );
  assert(content);
  for (const key of ['campus', 'year', 'offer']) assert(!(key in content.state));
  assert.equal(content.state.schemaVersion, 5);
});
