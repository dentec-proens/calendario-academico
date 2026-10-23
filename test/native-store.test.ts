import { test } from 'vitest';
import assert from 'node:assert/strict';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { reviewCriteria } from '../src/review.mjs';

const createBody = {
  year: 2027,
  modalities: ['integrado' as const],
  regime: 'anual' as const,
  courses: 'Curso sintético',
  purpose: 'test' as const,
};

test('calendar operations append immutable snapshots and roll back stale saves atomically', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const campus = asClient('campus-a');
  const created = await campus.mutation(api.native.createCalendar, {
    body: { ...createBody, campusId: ids.campuses.a },
  });
  const saved = await campus.mutation(api.native.saveCalendar, {
    id: created.id,
    body: {
      version: created.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: { ...created.state, weekEvidence: 'Ata sintética' },
    },
  });
  assert.equal(saved.version, 2);
  const before = await client.run(async (ctx) => ({
    snapshots: await ctx.db.query('calendarSnapshots').collect(),
    versions: await ctx.db.query('calendarVersions').collect(),
    audit: await ctx.db.query('audit').collect(),
  }));
  assert.equal(before.snapshots.length, 1);
  assert.equal(before.versions[0].version, 1);
  assert.deepEqual(before.snapshots[0].state, created.state);
  await assert.rejects(
    campus.mutation(api.native.saveCalendar, {
      id: created.id,
      body: {
        version: 1,
        catalogueRevision: created.currentCatalogueRevision,
        state: { ...created.state, weekEvidence: 'Tentativa concorrente' },
      },
    }),
    /Há versão mais recente/,
  );
  const after = await client.run(async (ctx) => ({
    snapshots: await ctx.db.query('calendarSnapshots').collect(),
    versions: await ctx.db.query('calendarVersions').collect(),
    audit: await ctx.db.query('audit').collect(),
  }));
  assert.deepEqual(after, before, 'a stale writer cannot append history or audit records');
  await campus.mutation(api.native.deleteCalendar, { id: created.id, version: 2 });
  await campus.mutation(api.native.restoreCalendar, { id: created.id });
  await campus.mutation(api.native.makeDefinitive, { id: created.id, version: 2 });
  const final = await client.run(async (ctx) => ({
    calendar: await ctx.db.get(created.id),
    snapshots: await ctx.db.query('calendarSnapshots').collect(),
    versions: await ctx.db.query('calendarVersions').collect(),
  }));
  assert.deepEqual(
    final.snapshots[0],
    before.snapshots[0],
    'trash, restore and conversion cannot rewrite prior calendar states',
  );
  assert.equal(final.snapshots.length, 2);
  assert.equal(final.calendar?.purpose, 'definitive');
  assert.deepEqual(
    final.versions.map((version) => version.version),
    [1, 2],
  );
});

test('review saves preserve earlier authorship and rejected edits append no revision', async () => {
  const { client, asClient, ids } = await createNativeFixture();
  const campus = asClient('campus-a');
  const admin = asClient('admin');
  const created = await campus.mutation(api.native.createCalendar, {
    body: { ...createBody, campusId: ids.campuses.a },
  });
  const support = await admin.query(api.native.review, { id: created.id });
  const body = {
    revision: 0,
    calendarVersion: created.version,
    catalogueRevision: support.catalogueRevision,
    conclusion: support.initialConclusion,
    entries: reviewCriteria.map((criterion) => ({
      id: criterion.id,
      status: 'PENDENTE' as const,
      notes: '',
      reviewed: false,
    })),
  };
  await admin.mutation(api.native.saveReview, { id: created.id, body });
  await admin.mutation(api.native.saveReview, {
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
    admin.mutation(api.native.saveReview, { id: created.id, body }),
    /Outro revisor/,
  );
  await assert.rejects(
    campus.mutation(api.native.saveReview, { id: created.id, body: { ...body, revision: 2 } }),
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
        modalities: createBody.modalities,
        purpose: createBody.purpose,
        courses: createBody.courses,
        campusId: ids.users.admin,
        classes: '',
        shifts: '',
        version: 1,
        updatedAt: Date.now(),
      } as never),
    ),
    /id|validator|unexpected/i,
  );
  const record = await asClient('campus-a').mutation(api.native.createCalendar, {
    body: { ...createBody, campusId: ids.campuses.a },
  });
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
  for (const key of ['campus', 'year', 'offer', 'schemaVersion']) assert(!(key in content.state));
});
