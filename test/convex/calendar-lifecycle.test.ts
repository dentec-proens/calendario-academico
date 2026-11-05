import { calendarRecordDates } from '../../web/shared/convex/calendar-dates.ts';
import { expect, test } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
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
        },
      })
      .then(calendarRecordDates);
    // Courses are required to submit; the identity mutation has its own tests.
    await f.client.run((ctx) =>
      ctx.db.patch(record.id, {
        courses: 'Curso sintético',
        ...(options.label ? { label: options.label } : {}),
      }),
    );
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
        schemaVersion: 6 as const,
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

test('a calendar keeps naming its campus after the campus is archived', async () => {
  const f = await fixture();
  const id = await f.create(['integrado'], { ready: true });
  await act(f.campus, id, 'submit');
  await f.client.run((ctx) => ctx.db.patch(f.ids.campuses.a, { archived: true }));
  const paginationOpts = { numItems: 10, cursor: null };
  const queue = await f.reviewer.query(api.reviews.reviewQueue, { paginationOpts });
  expect(queue.page.map((item) => item.campusName)).toEqual(['A']);
  const page = await f.reviewer.query(api.calendars.calendarPage, { paginationOpts });
  expect(page.page.map((item) => item.campusName)).toEqual(['A']);
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
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', next.id))
      .unique())!;
    await ctx.db.patch(content._id, {
      state: { ...content.state, weekdays: [1, 2, 3, 4] },
    });
  });
  await expect(act(f.admin, next.id, 'publish', { sei })).rejects.toThrow(/difere do envio/);
  await f.client.run(async (ctx) => {
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', next.id))
      .unique())!;
    await ctx.db.patch(content._id, {
      state: { ...content.state, weekdays: [1, 2, 3, 4, 5] },
    });
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
      effect: 'exclude',
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

test('the history queries and the transitional functions are no longer callable', async () => {
  const f = await fixture();
  const id = await f.create();
  await expect(
    f.campus.mutation(makeFunctionReference<'mutation'>('calendars:makeDefinitive'), {
      id,
      version: 1,
    }),
  ).rejects.toThrow(/Could not find|no such export|not found/);
  await expect(
    f.client.mutation(makeFunctionReference<'mutation'>('historyPurge:purgeCalendarHistory'), {}),
  ).rejects.toThrow(/Could not find|no such export|not found|Couldn't find/);
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

test('the review of each decision is read from the current or the archived revision', async () => {
  const f = await fixture();
  const id = await f.create();
  await act(f.campus, id, 'submit');
  await saveReview(f.reviewer, id, { status: 'NAO_ATENDIDO' });
  await act(f.reviewer, id, 'return', { note: 'Ajuste o recesso.' });
  await act(f.campus, id, 'submit');
  await saveReview(f.reviewer, id);
  const [first, second] = await f.submissions(id);
  expect(first.decisions[0].reviewRevision).toBe(1);
  const archived = await f.reviewer.query(api.reviews.submissionReview, {
    id,
    submissionId: first._id,
    revision: 1,
  });
  expect(archived.revision).toBe(1);
  expect(archived.entries.every((entry) => entry.status === 'NAO_ATENDIDO')).toBe(true);
  const current = await f.reviewer.query(api.reviews.submissionReview, {
    id,
    submissionId: second._id,
    revision: 2,
  });
  expect(current.submissionId).toBe(second._id);
  await expect(
    f.campus.query(api.reviews.submissionReview, { id, submissionId: first._id, revision: 1 }),
  ).rejects.toThrow(/Acesso exclusivo/);
  const other = await f.create(['subsequente']);
  await expect(
    f.reviewer.query(api.reviews.submissionReview, {
      id: other,
      submissionId: first._id,
      revision: 1,
    }),
  ).rejects.toThrow(/Envio não encontrado/);
});

test('a submission above 900 KiB is refused with its own message and writes nothing', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.client.run(async (ctx) => {
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique())!;
    const events = Array.from({ length: 860 }, (_, index) => ({
      id: `large-${index}`,
      name: 'x'.repeat(1100),
      start: '2027-03-01',
      end: '2027-03-01',
      effect: 'note' as const,
      offers: ['integrado'],
    }));
    await ctx.db.patch(content._id, { state: { ...content.state, events } });
  });
  await expect(act(f.campus, id, 'submit')).rejects.toThrow(/grande demais para ser enviado/);
  expect(await f.submissions(id)).toEqual([]);
  expect((await calendarStatus(f.campus, id)).status).toBe('rascunho');
});

test('one publication replaces every published calendar it covers', async () => {
  const f = await fixture();
  const integrated = await f.create(['integrado']);
  const subsequent = await f.create(['subsequente']);
  await f.client.run(async (ctx) => {
    for (const id of [integrated, subsequent])
      await ctx.db.patch(id, { status: 'vigente', statusRevision: 1 });
  });
  const combined = await f.create(['integrado', 'subsequente'], { ready: true });
  await act(f.campus, combined, 'submit');
  const preview = await f.admin.query(api.calendars.replacementPreview, { id: combined });
  expect(preview.replaced.map((item) => item.id).sort()).toEqual([integrated, subsequent].sort());
  expect(preview.replaced.every((item) => item.uncovered.length === 0)).toBe(true);
  await saveReview(f.reviewer, combined);
  await act(f.reviewer, combined, 'conclude');
  await act(f.admin, combined, 'publish', { sei });
  for (const id of [integrated, subsequent])
    expect((await calendarStatus(f.campus, id)).record).toMatchObject({
      status: 'arquivado',
      supersededByName: 'Calendário 2027 - Campus A',
    });
});

test('the review starts only by saving, and a changed base blocks conclusion before the review check', async () => {
  const f = await fixture();
  const id = await f.create(['integrado'], { ready: true });
  await act(f.campus, id, 'submit');
  await expect(act(f.reviewer, id, 'startReview')).rejects.toThrow(/começa ao salvar o parecer/);
  await saveReview(f.reviewer, id);
  await f.admin.mutation(api.catalogue.saveCatalogue, {
    body: {
      revision: 1,
      name: 'Feriado',
      active: true,
      start: '2027-04-21',
      end: '2027-04-21',
      effect: 'exclude',
      category: 'feriado',
      evidence: 'Lei',
      modalities: ['integrado'],
    },
  });
  await expect(act(f.reviewer, id, 'conclude')).rejects.toThrow(/base institucional mudou/);
});

test('restoring always returns a draft, even for a row deleted outside the lifecycle', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.client.run((ctx) =>
    ctx.db.patch(id, { status: 'revisado', statusRevision: 4, deletedAt: Date.now() }),
  );
  await expect(
    f.campus.mutation(api.calendars.restoreCalendar, { id, version: 2 }),
  ).rejects.toThrow(/Atualize a lixeira/);
  await f.campus.mutation(api.calendars.restoreCalendar, { id, version: 1 });
  expect(await calendarStatus(f.campus, id)).toMatchObject({
    status: 'rascunho',
    statusRevision: 5,
  });
});
