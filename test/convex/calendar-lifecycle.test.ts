import { calendarRecordDates } from '../../web/shared/convex/calendar-dates.ts';
import { expect, test } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { api, internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { purposeToStatus } from '../../convex/migrations.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, calendarStatus, readyContent, saveReview } from '../helpers/lifecycle.ts';

const sei = '23411.000001/2027-11';

async function fixture() {
  const f = await createNativeFixture();
  const reviewerIdentity = await f.client.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: 'Parecerista',
      email: 'parecer@ifpr.edu.br',
      role: 'PARECERISTA',
      active: true,
      loginMethod: 'local',
    });
    const sessionId = await ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 3_600_000,
    });
    return { subject: `${userId}|${sessionId}` };
  });
  const campus = f.asClient('campus-a');
  const create = async (
    kinds: ('integrado' | 'subsequente')[] = ['integrado'],
    options: { ready?: boolean; label?: string } = {},
  ) => {
    const record = await campus
      .mutation(api.calendars.createCalendar, {
        body: {
          campusId: f.ids.campuses.a,
          year: 2027,
          offers: kinds.map((kind) => ({ kind, organization: 'anual' as const })),
          courses: 'Curso sintético',
          ...(options.label ? { label: options.label } : {}),
        },
      })
      .then(calendarRecordDates);
    if (options.ready)
      await f.client.run(async (ctx) => {
        const content = await ctx.db
          .query('calendarContents')
          .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
          .unique();
        await ctx.db.patch(content!._id, { state: readyContent() as never });
      });
    return record.id;
  };
  const submissions = (id: Id<'calendars'>) =>
    f.client.run((ctx) =>
      ctx.db
        .query('calendarSubmissions')
        .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', id))
        .collect(),
    );
  return {
    ...f,
    campus,
    otherCampus: f.asClient('campus-b'),
    reviewer: f.client.withIdentity(reviewerIdentity),
    admin: f.asClient('admin'),
    create,
    submissions,
  };
}

/** Takes a ready calendar from draft to published. */
async function publish(f: Awaited<ReturnType<typeof fixture>>, id: Id<'calendars'>) {
  await act(f.campus, id, 'submit');
  await saveReview(f.reviewer, id);
  await act(f.reviewer, id, 'conclude');
  return act(f.admin, id, 'publish', { sei });
}

test('a new calendar is a draft; submitting copies the content and locks every write', async () => {
  const f = await fixture();
  const id = await f.create(['integrado'], { label: 'Proposta A' });
  const created = await calendarStatus(f.campus, id);
  expect(created.status).toBe('rascunho');
  expect(created.record.name).toBe('Calendário 2027 - Campus A — Proposta A');
  expect(created.record.submission).toBeNull();
  await act(f.campus, id, 'submit');
  const [submission] = await f.submissions(id);
  const content = await f.client.run((ctx) =>
    ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique(),
  );
  expect(submission).toMatchObject({
    sequence: 1,
    submittedFrom: 'rascunho',
    contentVersion: created.record.version,
    state: content!.state,
    institutionalSnapshot: content!.institutionalSnapshot,
    documentSnapshot: content!.documentSnapshot,
    catalogueRevision: content!.catalogueRevision,
    offerKinds: ['integrado'],
    campusName: 'A',
    decisions: [],
  });
  expect(submission.contentHash).toMatch(/^[0-9a-f]{64}$/);
  const sent = await calendarStatus(f.campus, id);
  expect(sent.status).toBe('enviado');
  expect(sent.record.version, 'transitions never advance the content version').toBe(1);
  expect(sent.record.submission).toMatchObject({ id: submission._id, sequence: 1 });
  const record = sent.record;
  await expect(
    f.campus.mutation(api.calendars.saveCalendar, {
      id,
      body: { version: 1, catalogueRevision: record.currentCatalogueRevision, state: record.state },
    }),
  ).rejects.toThrow(/enviado e não pode ser alterado/);
  await expect(
    f.campus.mutation(api.calendars.synchronizeBase, { id, version: 1 }),
  ).rejects.toThrow(/não pode ser alterado/);
  await expect(f.campus.mutation(api.calendars.deleteCalendar, { id, version: 1 })).rejects.toThrow(
    /não pode ir para a lixeira/,
  );
  await expect(
    f.campus.mutation(api.calendars.transitionCalendar, {
      id,
      from: 'enviado',
      statusRevision: 0,
      action: 'withdraw',
    }),
  ).rejects.toThrow(/mudou em outra sessão/);
});

test('withdrawing keeps the submission, and the sequence is never reused', async () => {
  const f = await fixture();
  const id = await f.create();
  await act(f.campus, id, 'submit');
  await act(f.campus, id, 'withdraw');
  expect((await calendarStatus(f.campus, id)).status).toBe('rascunho');
  await act(f.campus, id, 'submit');
  const rows = await f.submissions(id);
  expect(rows.map((row) => [row.sequence, row.decisions.map((item) => item.action)])).toEqual([
    [1, ['withdrawn']],
    [2, []],
  ]);
  await expect(act(f.reviewer, id, 'withdraw')).rejects.toThrow(/não permitida/);
});

test('reviews are bound to the submission and the first save starts the review', async () => {
  const f = await fixture();
  const id = await f.create();
  await expect(saveReview(f.reviewer, id)).rejects.toThrow(/enviado ou em revisão/);
  await act(f.campus, id, 'submit');
  const opened = await f.reviewer.query(api.reviews.review, { id });
  expect(opened.status).toBe('enviado');
  await act(f.campus, id, 'withdraw');
  await act(f.campus, id, 'submit');
  // A tab opened in the previous round cannot write to the new one, even without edits.
  await expect(
    f.reviewer.mutation(api.reviews.saveReview, {
      id,
      body: {
        rulesetVersion: opened.rulesetVersion,
        baseIdentity: opened.baseIdentity,
        revision: 0,
        calendarVersion: opened.calendar.version,
        catalogueRevision: opened.catalogueRevision,
        conclusion: opened.initialConclusion,
        submissionId: opened.submission!.id,
        entries: [],
      },
    }),
  ).rejects.toThrow(/reenviado ou recolhido/);
  await saveReview(f.reviewer, id);
  const review = await f.reviewer.query(api.reviews.review, { id });
  expect(review.status).toBe('em_revisao');
  expect(review.stale).toBe(false);
  expect(review.review?.submissionId).toBe(review.submission?.id);
  const queue = await f.reviewer.query(api.reviews.reviewQueue, {
    status: 'em_revisao',
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(queue.page.map((item) => [item.id, item.submission?.sequence])).toEqual([[id, 2]]);
  const drafts = await f.reviewer.query(api.reviews.reviewQueue, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(drafts.page, 'the default tab lists submitted calendars only').toEqual([]);
});

test('returns, conclusions and reopenings accumulate decisions; the campus reads the note', async () => {
  const f = await fixture();
  const id = await f.create();
  await act(f.campus, id, 'submit');
  await expect(act(f.reviewer, id, 'return', { note: '  ' })).rejects.toThrow(/Descreva/);
  // No review saved in this round: the return carries no review revision.
  await act(f.reviewer, id, 'return', { note: 'Ajuste o recesso.' });
  const returned = await calendarStatus(f.campus, id);
  expect(returned.status).toBe('devolvido');
  expect(returned.record.lastReturn).toEqual({
    submissionId: returned.record.submission!.id,
    sequence: 1,
    at: expect.any(String),
    note: 'Ajuste o recesso.',
  });
  const [first] = await f.submissions(id);
  expect(first.decisions).toEqual([
    expect.objectContaining({ action: 'returned', note: 'Ajuste o recesso.' }),
  ]);
  expect(first.decisions[0]).not.toHaveProperty('reviewRevision');

  await act(f.campus, id, 'submit');
  const resent = await calendarStatus(f.campus, id);
  expect(resent.record.submission).toMatchObject({ sequence: 2, previousSubmissionId: first._id });
  // Withdrawing a resubmission points back to the returned submission and its note.
  await act(f.campus, id, 'withdraw');
  const back = await calendarStatus(f.campus, id);
  expect(back.status).toBe('devolvido');
  expect(back.record.submission?.id).toBe(first._id);
  expect(back.record.lastReturn?.note).toBe('Ajuste o recesso.');

  await act(f.campus, id, 'submit');
  const queued = await f.reviewer.query(api.reviews.reviewQueue, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(queued.page[0].review, 'a review without this round is not current').toBeNull();
  await expect(act(f.reviewer, id, 'conclude')).rejects.toThrow(/não se aplica/);
  await saveReview(f.reviewer, id, { status: 'NAO_ATENDIDO' });
  await expect(act(f.reviewer, id, 'conclude')).rejects.toThrow(/não atendido/);
  await saveReview(f.reviewer, id);
  await act(f.reviewer, id, 'conclude');
  await act(f.reviewer, id, 'reopen');
  await act(f.reviewer, id, 'conclude');
  await act(f.reviewer, id, 'return', { note: 'Confira as férias.' });
  const third = (await f.submissions(id)).at(-1)!;
  expect(third.decisions.map((item) => [item.action, item.reviewRevision])).toEqual([
    ['concluded', 2],
    ['reopened', 2],
    ['concluded', 2],
    ['returned', 2],
  ]);
  const listing = await f.campus.query(api.calendars.calendarSubmissions, {
    id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(listing.page.map((item) => item.sequence)).toEqual([4, 3, 2, 1].slice(1));
  expect(listing.page[0]).not.toHaveProperty('state');
  expect(listing.page[0].decisions.at(-1)).toEqual({
    action: 'returned',
    at: expect.any(String),
    note: 'Confira as férias.',
  });
  expect(listing.defaultBases).toEqual([third._id]);
  const reviewerListing = await f.reviewer.query(api.calendars.calendarSubmissions, {
    id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(reviewerListing.page[0].decisions.at(-1)).toMatchObject({ reviewRevision: 2 });
  await act(f.campus, id, 'submit');
  const resubmitted = await f.reviewer.query(api.reviews.reviewQueue, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(resubmitted.page[0].review).toMatchObject({
    otherSubmission: true,
    calendarChanged: false,
  });
});

test('one calendar per campus, year and offer kind in flow, even when an offer is added later', async () => {
  const f = await fixture();
  const first = await f.create(['integrado', 'subsequente']);
  const second = await f.create(['subsequente']);
  const third = await f.create(['integrado']);
  await act(f.campus, first, 'submit');
  const before = await f.client.run((ctx) => ctx.db.query('calendarSubmissions').collect());
  await expect(act(f.campus, second, 'submit')).rejects.toThrow(/Já há calendário em análise/);
  expect(
    await f.client.run((ctx) => ctx.db.query('calendarSubmissions').collect()),
    'a refusal writes nothing',
  ).toEqual(before);
  await act(f.campus, first, 'withdraw');
  await act(f.campus, third, 'submit');
  await act(f.reviewer, third, 'return', { note: 'Ajuste.' });
  await act(f.campus, second, 'submit');
  const record = (await calendarStatus(f.campus, third)).record;
  await expect(
    f.campus.mutation(api.calendars.saveCalendar, {
      id: third,
      body: {
        version: record.version,
        catalogueRevision: record.currentCatalogueRevision,
        state: {
          ...record.state,
          offers: [
            ...record.state.offers,
            {
              id: 'subsequente',
              kind: 'subsequente',
              delivery: 'presencial',
              organization: 'anual',
            },
          ],
        },
      },
    }),
  ).rejects.toThrow(/Já há calendário em análise/);
  // Deleting a returned calendar demotes it to a draft and frees its place.
  await f.campus.mutation(api.calendars.deleteCalendar, { id: third, version: record.version });
  await f.campus.mutation(api.calendars.restoreCalendar, { id: third, version: record.version });
  const restored = await calendarStatus(f.campus, third);
  expect(restored.status).toBe('rascunho');
  expect(restored.record.submission).toBeNull();
  expect(restored.record.lastReturn?.note).toBe('Ajuste.');
  expect(await f.submissions(third)).toHaveLength(1);
  // The next submission still answers that return, and withdrawing leaves no pointer in a draft.
  await act(f.campus, second, 'withdraw');
  await act(f.campus, third, 'submit');
  const [returned, resent] = await f.submissions(third);
  expect(resent.previousSubmissionId).toBe(returned._id);
  const listing = await f.reviewer.query(api.calendars.calendarSubmissions, {
    id: third,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(listing.defaultBases).toEqual([returned._id]);
  await act(f.campus, third, 'withdraw');
  const withdrawn = await calendarStatus(f.campus, third);
  expect(withdrawn.status).toBe('rascunho');
  expect(withdrawn.record.submission).toBeNull();
});

test('publication checks the SEI, the review and the content, and archives what it replaces', async () => {
  const f = await fixture();
  const old = await f.create(['integrado'], { ready: true });
  await publish(f, old);
  const published = await calendarStatus(f.campus, old);
  expect(published.status).toBe('vigente');
  expect(published.record.seiProcess).toBe(sei);
  expect(published.record.readiness.officialApproval).toBe(true);
  expect(
    (await f.reviewer.query(api.reviews.exportReview, { id: old, revision: 1 })).text,
    'the review stays exportable after publication',
  ).toMatch(/minuta/i);

  await expect(
    f.reviewer.mutation(api.calendars.createCalendarVersion, { id: old }),
  ).rejects.toThrow(/Pareceristas/);
  await expect(
    f.otherCampus.mutation(api.calendars.createCalendarVersion, { id: old }),
  ).rejects.toThrow(/Registro não encontrado/);
  const next = await f.campus.mutation(api.calendars.createCalendarVersion, { id: old });
  expect(next).toMatchObject({ status: 'rascunho', derivedFrom: old, version: 1 });
  expect(next.state.events).toEqual(published.record.state.events);
  expect(next.institutionalSnapshot).toEqual(published.record.institutionalSnapshot);
  await expect(
    f.campus.mutation(api.calendars.createCalendarVersion, { id: next.id }),
  ).rejects.toThrow(/Somente um calendário vigente/);
  await act(f.campus, next.id, 'submit');
  const listing = await f.reviewer.query(api.calendars.calendarSubmissions, {
    id: next.id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(listing.defaultBases).toEqual([published.record.submission!.id]);
  const base = await f.reviewer.query(api.calendars.submissionContent, {
    id: next.id,
    submissionId: listing.defaultBases[0],
  });
  expect(base.calendarId).toBe(old);
  await saveReview(f.reviewer, next.id);
  await act(f.reviewer, next.id, 'conclude');
  await expect(act(f.admin, next.id, 'publish', { sei: '123' })).rejects.toThrow(/formato/);
  await expect(act(f.campus, next.id, 'publish', { sei })).rejects.toThrow(/não permitida/);
  // Same version, different content: publication compares the submitted fingerprint.
  await f.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', next.id))
      .unique();
    await ctx.db.patch(content!._id, { state: { ...content!.state, weekdays: [1, 2, 3, 4] } });
  });
  await expect(act(f.admin, next.id, 'publish', { sei })).rejects.toThrow(/difere do envio/);
  await f.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', next.id))
      .unique();
    await ctx.db.patch(content!._id, { state: { ...content!.state, weekdays: [1, 2, 3, 4, 5] } });
  });
  await act(f.admin, next.id, 'publish', { sei: '23411.000002/2027-22' });
  const archived = await calendarStatus(f.campus, old);
  expect(archived.status).toBe('arquivado');
  expect(archived.record.supersededByName).toBe('Calendário 2027 - Campus A');
  await expect(act(f.admin, old, 'reinstate')).rejects.toThrow(/outro calendário vigente/);
  await act(f.admin, next.id, 'archive');
  await act(f.admin, old, 'reinstate');
  expect((await calendarStatus(f.campus, old)).record.supersededByName).toBeUndefined();
});

test('coverage of the published calendars is checked on submission and again on publication', async () => {
  const f = await fixture();
  const combined = await f.create(['integrado', 'subsequente'], { ready: true });
  await f.client.run(async (ctx) => {
    await ctx.db.patch(combined, { status: 'vigente', statusRevision: 1 });
  });
  const narrower = await f.create(['integrado'], { ready: true });
  await expect(act(f.campus, narrower, 'submit')).rejects.toThrow(
    /precisa incluir Técnico subsequente/,
  );
  // The administration can submit and publish a partial replacement with explicit confirmation.
  await expect(act(f.admin, narrower, 'submit')).rejects.toThrow(/Confirme a substituição parcial/);
  await act(f.admin, narrower, 'submit', { partial: true });
  await saveReview(f.reviewer, narrower);
  await act(f.reviewer, narrower, 'conclude');
  await expect(act(f.admin, narrower, 'publish', { sei })).rejects.toThrow(/substituição parcial/);
  await act(f.admin, narrower, 'publish', { sei, partial: true });
  expect((await calendarStatus(f.campus, combined)).status).toBe('arquivado');
});

test('a base change warns in review and refuses publication, but never alters a published one', async () => {
  const f = await fixture();
  const id = await f.create(['integrado'], { ready: true });
  await publish(f, id);
  const sent = await f.create(['integrado'], { ready: true });
  await f.client.run((ctx) => ctx.db.patch(id, { status: 'arquivado' }));
  await act(f.campus, sent, 'submit');
  await saveReview(f.reviewer, sent);
  await act(f.reviewer, sent, 'conclude');
  await f.client.run((ctx) => ctx.db.patch(id, { status: 'vigente' }));
  const before = (await calendarStatus(f.campus, id)).record;
  await f.admin.mutation(api.catalogue.saveCatalogue, {
    body: {
      revision: 1,
      name: 'Feriado',
      active: true,
      start: '2027-04-21',
      end: '2027-04-21',
      kind: 'exclude',
      category: 'feriado',
      evidence: 'Lei',
      modalities: ['integrado'],
    },
  });
  const after = (await calendarStatus(f.campus, id)).record;
  expect(after.readiness).toEqual(before.readiness);
  expect(after.institutionalEvents).toEqual(before.institutionalEvents);
  const locked = (await calendarStatus(f.campus, sent)).record;
  expect(locked.readiness.warnings.some((warning) => /mudou depois do envio/.test(warning))).toBe(
    true,
  );
  await expect(act(f.admin, sent, 'publish', { sei })).rejects.toThrow(
    /parecer não corresponde|base institucional mudou/,
  );
});

test('submission copies are read only through their own calendar chain', async () => {
  const f = await fixture();
  const own = await f.create();
  const other = await f.create();
  await act(f.campus, own, 'submit');
  await act(f.campus, other, 'submit').catch(() => undefined);
  const [submission] = await f.submissions(own);
  await expect(
    f.campus.query(api.calendars.submissionContent, { id: other, submissionId: submission._id }),
  ).rejects.toThrow(/Envio não encontrado/);
  await expect(
    f.otherCampus.query(api.calendars.submissionContent, { id: own, submissionId: submission._id }),
  ).rejects.toThrow(/Registro não encontrado/);
  const copy = await f.campus.query(api.calendars.submissionContent, {
    id: own,
    submissionId: submission._id,
  });
  expect(copy.state).toMatchObject({ year: 2027, campus: 'A' });
});

test('the migration converts every calendar to a draft, keeps the version and is idempotent', () => {
  const row = (fields: object) =>
    ({ _id: 'c', version: 7, offerKinds: ['integrado'], ...fields }) as never;
  expect(purposeToStatus(row({ purpose: 'test' }))).toEqual({
    status: 'rascunho',
    statusRevision: 0,
    label: 'Teste',
    purpose: undefined,
  });
  expect(purposeToStatus(row({ purpose: 'definitive', deletedAt: 1 }))).toEqual({
    status: 'rascunho',
    statusRevision: 0,
    purpose: undefined,
  });
  expect(purposeToStatus(row({ purpose: 'test', label: 'Meu' }))).not.toHaveProperty('label');
  expect(purposeToStatus(row({ status: 'rascunho', statusRevision: 0 }))).toBeUndefined();
});

test('the migration runs over the table, trash included, without touching contents or reviews', async () => {
  const f = await fixture();
  const ids = await f.client.run(async (ctx) => {
    const row = {
      campusId: f.ids.campuses.a,
      year: 2027,
      offerKinds: ['integrado' as const],
      courses: 'Anterior',
      classes: '',
      shifts: '',
      version: 4,
      updatedAt: 1,
    };
    return [
      await ctx.db.insert('calendars', { ...row, purpose: 'test' }),
      await ctx.db.insert('calendars', { ...row, purpose: 'definitive', deletedAt: 2 }),
    ];
  });
  for (let pass = 0; pass < 2; pass++)
    await f.client.mutation(internal.migrations.calendarPurposeToStatus, {
      cursor: null,
      dryRun: false,
    });
  const rows = await f.client.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
  expect(rows.map((row) => [row?.status, row?.label, row?.purpose, row?.version])).toEqual([
    ['rascunho', 'Teste', undefined, 4],
    ['rascunho', undefined, undefined, 4],
  ]);
  // The former test calendar stays recognizable by its title.
  const listed = await f.client.run((ctx) => ctx.db.get(ids[0]));
  expect(listed?.label).toBe('Teste');
  const [summary] = (
    await f.campus.query(api.calendars.calendarPage, {
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).page.filter((item) => item.id === ids[0]);
  expect(summary.name).toBe('Calendário 2027 - Campus A — Teste');
});

test('a row without status reads as a draft and creation ignores the previous purpose', async () => {
  const f = await fixture();
  const id = await f.campus
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: f.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
        courses: 'Curso',
        purpose: 'definitive',
      },
    })
    .then((record) => record.id);
  await f.client.run((ctx) =>
    ctx.db.patch(id, { status: undefined, statusRevision: undefined, purpose: 'test' }),
  );
  const legacy = await calendarStatus(f.campus, id);
  expect(legacy).toMatchObject({ status: 'rascunho', statusRevision: 0 });
  const raw = await f.client.run((ctx) => ctx.db.get(id));
  expect(raw?.purpose).toBe('test');
});

test('the history queries are no longer callable', async () => {
  const f = await fixture();
  const id = await f.create();
  for (const name of ['calendars:calendarHistory', 'calendars:calendarVersion'])
    await expect(
      f.campus.query(makeFunctionReference<'query'>(name), {
        id,
        version: 1,
        paginationOpts: { numItems: 1, cursor: null },
      }),
    ).rejects.toThrow(/Could not find|no such export|not found/);
  const record = await f.campus.query(api.calendars.calendar, { id });
  expect(record).not.toHaveProperty('versions');
  expect(record).not.toHaveProperty('purpose');
});

test('the level 2 purge deletes only the per-save history, batch by batch', async () => {
  const f = await fixture();
  const id = await f.create();
  const keep = await f.client.run(async (ctx) => {
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique())!;
    for (let version = 1; version <= 3; version++) {
      const snapshotId = await ctx.db.insert('calendarSnapshots', {
        state: { ...content.state, year: 2027, campus: 'A' },
        at: version,
        catalogueRevision: content.catalogueRevision,
        institutionalEvents: content.institutionalSnapshot,
        documentSnapshot: [],
      });
      await ctx.db.insert('calendarVersions', {
        calendarId: id,
        version,
        at: version,
        catalogueRevision: content.catalogueRevision,
        snapshotId,
      });
    }
    return {
      calendars: await ctx.db.query('calendars').collect(),
      contents: await ctx.db.query('calendarContents').collect(),
    };
  });
  const batches = [];
  for (;;) {
    const batch = await f.client.mutation(internal.historyPurge.purgeCalendarHistory, {
      batchSize: 2,
    });
    batches.push(batch);
    if (batch.done) break;
  }
  expect(batches).toEqual([
    { versions: 2, snapshots: 0, done: false },
    { versions: 1, snapshots: 1, done: false },
    { versions: 0, snapshots: 2, done: true },
  ]);
  expect(
    await f.client.run(async (ctx) => ({
      calendars: await ctx.db.query('calendars').collect(),
      contents: await ctx.db.query('calendarContents').collect(),
    })),
  ).toEqual(keep);
});
