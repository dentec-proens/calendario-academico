import assert from 'node:assert/strict';
import { ConvexError } from 'convex/values';
import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Doc, Id } from '../../convex/_generated/dataModel.js';
import { maintenanceMessage } from '../../convex/lib/maintenance.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { preserveSubmission } from '../helpers/lifecycle.ts';
import { v4CatalogueRows, v4Cases, type V4CatalogueRow } from '../helpers/v4-fixtures.ts';

/**
 * Phase 2, step 17a of `docs/plans/2026-11-02-atividades-e-datas.md`: the widened schema stores
 * v4 documents only for the migration. Every reader of such a document answers the operational
 * unavailability of maintenance (503) instead of adapting it, while authentication, the
 * maintenance query and the readers of v5 documents keep answering.
 */
async function unavailable(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ConvexError);
    assert.deepEqual(error.data, { status: 503, error: maintenanceMessage });
    return true;
  });
}

const [v4Case] = v4Cases().filter(
  (item) => item.submissions.length && item.content.institutionalSnapshot.length,
);

async function setup() {
  const fixture = await createNativeFixture();
  const campus = fixture.asClient('campus-a');
  const admin = fixture.asClient('admin');
  const record = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
  // Submitted and returned: the calendar keeps an editable content and a submission.
  await preserveSubmission(fixture, record.id);
  const stored = await fixture.client.run(async (ctx) => {
    const calendar = (await ctx.db.get(record.id))!;
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique())!;
    return { calendar, content, submissionId: calendar.currentSubmissionId! };
  });
  /** Authentication and the maintenance query answer whatever format the documents have. */
  const stillAnswers = async () => {
    expect((await campus.query(api.access.session.me, {}))?.email).toBe('a@ifpr.edu.br');
    expect((await admin.query(api.access.session.status, {})).user?.email).toBe(
      'admin@ifpr.edu.br',
    );
    expect(await campus.query(api.operations.availability, {})).toEqual({ maintenance: false });
  };
  return { ...fixture, campus, admin, record, stored, stillAnswers };
}

/** Stores a v4 document in place of a v5 one, as a deployment before the migration has it. */
const v4Content = (content: Doc<'calendarContents'>) => ({
  calendarId: content.calendarId,
  catalogueRevision: content.catalogueRevision,
  documentSnapshot: content.documentSnapshot,
  state: v4Case.content.state,
  institutionalSnapshot: v4Case.content.institutionalSnapshot,
});

test('a calendar content still in v4 answers maintenance to the editor and the reviews', async () => {
  const f = await setup();
  const { record, stored, campus, admin } = f;
  const v4 = v4Content(stored.content);
  await f.client.run((ctx) => ctx.db.replace(stored.content._id, v4 as never));
  await unavailable(campus.query(api.calendars.calendar, { id: record.id }));
  await unavailable(admin.query(api.reviews.review, { id: record.id }));
  await unavailable(admin.query(api.reviews.exportReview, { id: record.id, revision: 1 }));
  await unavailable(
    campus.mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: stored.calendar.version,
        catalogueRevision: record.catalogueRevision,
        state: record.state,
      },
    }),
  );
  await unavailable(
    campus.mutation(api.calendars.synchronizeBase, {
      id: record.id,
      version: stored.calendar.version,
    }),
  );
  await unavailable(
    campus.mutation(api.calendars.transitionCalendar, {
      id: record.id,
      from: stored.calendar.status,
      statusRevision: stored.calendar.statusRevision,
      action: 'submit',
    }),
  );
  // Nothing was written over the v4 document, nor around it.
  const after = await f.client.run(async (ctx) => ({
    content: await ctx.db.get(stored.content._id),
    calendar: await ctx.db.get(record.id),
  }));
  expect(after.content).toMatchObject(v4);
  expect(after.calendar).toEqual(stored.calendar);
  // The v5 submission of the same calendar is still readable, and so is the calendar list.
  const submission = await campus.query(api.calendars.submissionContent, {
    id: record.id,
    submissionId: stored.submissionId,
  });
  expect(submission.state.schemaVersion).toBe(5);
  const page = await campus.query(api.calendars.calendarPage, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(page.page.map((item) => item.id)).toEqual([record.id]);
  await f.stillAnswers();
});

test('a submission still in v4 answers maintenance to the comparison', async () => {
  const f = await setup();
  const { record, stored, campus } = f;
  const [copy] = v4Case.submissions;
  await f.client.run((ctx) =>
    ctx.db.patch(stored.submissionId, {
      state: copy.state,
      institutionalSnapshot: copy.institutionalSnapshot,
    } as never),
  );
  await unavailable(
    campus.query(api.calendars.submissionContent, {
      id: record.id,
      submissionId: stored.submissionId,
    }),
  );
  // The submission list reads only metadata; the v5 content keeps the editor available.
  const list = await campus.query(api.calendars.calendarSubmissions, {
    id: record.id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(list.page.map((item) => item.id)).toEqual([stored.submissionId]);
  expect((await campus.query(api.calendars.calendar, { id: record.id })).state.schemaVersion).toBe(
    5,
  );
  await f.stillAnswers();
});

test('a catalogue row still in v4 answers maintenance to its readers and to the catalogue form', async () => {
  const f = await setup();
  const { record, campus, admin } = f;
  const row: V4CatalogueRow = { ...v4CatalogueRows()[0], year: 2027 };
  const id = await f.client.run((ctx) => ctx.db.insert('institutionalEvents', row as never));
  await unavailable(admin.query(api.workspace.bootstrap, {}));
  await unavailable(campus.query(api.calendars.calendar, { id: record.id }));
  await unavailable(
    admin.mutation(api.catalogue.saveCatalogue, {
      body: {
        id: row.code,
        revision: (await f.client.run((ctx) =>
          ctx.db
            .query('institutionSettings')
            .withIndex('by_key', (q) => q.eq('key', 'catalogue'))
            .unique(),
        ))!.revision,
        name: 'Data convertida pelo formulário',
        start: String(row.start),
        end: String(row.end),
        effect: 'note',
        category: String(row.category),
        evidence: String(row.evidence),
        modalities: ['integrado'],
        active: true,
      },
    }),
  );
  const { _id, _creationTime, ...fields } = (await f.client.run((ctx) =>
    ctx.db.get(id as Id<'institutionalEvents'>),
  ))!;
  expect(fields).toEqual(row);
  await f.stillAnswers();
});
