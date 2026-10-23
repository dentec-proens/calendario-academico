import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges } from '../convex/store.ts';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';
import { createNativeFixture } from './helpers/native-database.ts';
import { reviewCriteria } from '../src/review.mjs';

const createBody = {
  campusId: 'a',
  year: 2027,
  modalities: ['integrado'],
  regime: 'anual',
  courses: 'Curso sintético',
  purpose: 'test',
};

test('Convex persistence rejects calendar removal, rewritten version snapshots and replacement of audit history', async () => {
  const { client, as, inspect } = await createNativeFixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', createBody);
  const path = '/api/calendars/' + record.id;
  const originalState = (await inspect()).calendars[0].state;
  await campus.write(
    path,
    {
      version: 1,
      catalogueRevision: 1,
      state: { ...record.state, weekEvidence: 'Alteração sintética' },
    },
    'PUT',
  );
  const before = await inspect();
  const rows = await client.run(async (ctx) => ({
    calendar: await ctx.db.query('calendars').first(),
    audit: await ctx.db.query('audit').first(),
  }));
  const change = (entry) => client.run((ctx) => applyChanges(ctx, [entry], { full: true }));
  await assert.rejects(change({ field: 'calendars', removeRoot: true }), /preservado/);
  await assert.rejects(
    change({ field: 'calendars', deleteKeys: [rows.calendar.key] }),
    /preservado/,
  );
  const replaceCalendar = (value) =>
    change({
      field: 'calendars',
      upserts: [
        {
          key: rows.calendar.key,
          position: rows.calendar.position,
          value: encodeValue(value),
        },
      ],
    });
  await assert.rejects(
    replaceCalendar({ ...before.calendars[0], versions: [] }),
    /histórico existente/,
  );
  const altered = structuredClone(before.calendars[0]);
  altered.versions[0].state.weekEvidence = 'Tentativa de sobrescrever o passado';
  await assert.rejects(replaceCalendar(altered), /histórico existente/);
  await assert.rejects(
    change({
      field: 'audit',
      upserts: [
        {
          key: rows.audit.key,
          position: rows.audit.position,
          value: encodeValue({ ...decodeValue(rows.audit.value), action: 'FORGED' }),
        },
      ],
    }),
    /auditoria existente/,
  );
  assert.deepEqual(
    await inspect(),
    before,
    'rejected transactions cannot alter live or archived data',
  );
  const snapshots = await client.run((ctx) => ctx.db.query('calendarSnapshots').collect());
  assert.equal(snapshots.length, 1);
  assert.deepEqual(decodeValue(snapshots[0].value).state, originalState);
});

test('Convex persistence keeps review history append-only and preserves archived review authorship', async () => {
  const { client, as, inspect } = await createNativeFixture();
  const record = await as('campus-a').write('/api/calendars', createBody);
  const admin = as('admin');
  const path = '/api/reviews/' + record.id;
  const support = await admin.read(path);
  const body = {
    revision: 0,
    calendarVersion: 1,
    catalogueRevision: 1,
    conclusion: support.initialConclusion,
    entries: reviewCriteria.map((criterion) => ({
      id: criterion.id,
      status: 'PENDENTE',
      notes: '',
      reviewed: false,
    })),
  };
  await admin.write(path, body, 'PUT');
  await admin.write(path, { ...body, revision: 1 }, 'PUT');
  const before = await inspect();
  const row = await client.run((ctx) => ctx.db.query('reviews').first());
  const replace = (value) =>
    client.run((ctx) =>
      applyChanges(
        ctx,
        [
          {
            field: 'reviews',
            upserts: [{ key: row.key, position: row.position, value: encodeValue(value) }],
          },
        ],
        { full: true },
      ),
    );
  await assert.rejects(replace({ ...before.reviews[0], history: [] }), /histórico de pareceres/);
  const altered = structuredClone(before.reviews[0]);
  altered.history[0].updatedBy = 'forged-reviewer';
  await assert.rejects(replace(altered), /histórico de pareceres/);
  await assert.rejects(
    client.run((ctx) =>
      applyChanges(
        ctx,
        [
          {
            field: 'reviews',
            deleteKeys: [row.key],
          },
        ],
        { full: true },
      ),
    ),
    /preservado/,
  );
  assert.deepEqual(await inspect(), before);
  assert.equal(before.reviews[0].history.length, 1);
});
