import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { syntheticPdf } from './helpers/synthetic-pdf.ts';
import { historyCandidateKey } from '../src/history-progress.ts';

test('native PDF upload, analysis and confirmed historical evidence stay scoped to the owning campus', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  const { client, as, asClient, inspect, ids } = await createNativeFixture();
  const campus = as('campus-a');
  const actor = asClient('campus-a');
  const foreign = asClient('campus-b');
  const record = await campus.write('/api/calendars', {
    campusId: 'a',
    year: 2027,
    modalities: ['integrado'],
    regime: 'anual',
    purpose: 'test',
    courses: 'Curso sintético',
  });
  const bytes = syntheticPdf();
  const upload = await actor.mutation(api.nativeFiles.issueUpload, {
    filename: 'anterior-sintetico.pdf',
    size: bytes.length,
  });
  const storageId = await client.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })),
  );
  await actor.action(api.actions.uploads.completeUpload, { uploadId: upload.uploadId, storageId });
  const uploaded = await actor.action(api.actions.history.uploadHistory, {
    calendarId: record.id,
    filename: 'anterior-sintetico.pdf',
    year: 2026,
    uploadId: upload.uploadId,
  });
  const analyze = (user: typeof actor | typeof client) =>
    user.action(api.actions.history.analyzeHistory, { id: uploaded.id });
  await assert.rejects(analyze(client), /Entre com sua conta/);
  await assert.rejects(analyze(foreign), /Registro não encontrado/);
  const parsed = await analyze(actor);
  assert.equal(parsed.candidates[0].category, 'feriado');
  assert.equal(parsed.candidates[0].page, 1);
  assert(!('start' in parsed.candidates[0]));
  assert.deepEqual(await analyze(actor), parsed);
  const fresh = await campus.read('/api/calendars/' + record.id);
  assert.equal(fresh.state.events.length, 0, 'analysis cannot apply or confirm a suggested event');
  assert.equal(fresh.histories[0].analyzed, true);
  assert(!('analysis' in fresh.histories[0]));
  assert(!('objectKey' in fresh.histories[0]));
  const state = {
    ...fresh.state,
    events: [
      {
        id: 'confirmed-local',
        name: 'Feriado municipal confirmado',
        start: '2027-06-24',
        end: '2027-06-24',
        kind: 'exclude',
        category: 'feriado',
        evidence: 'Lei municipal conferida pelo campus',
        historicalSource: {
          historyId: uploaded.id,
          page: 1,
          candidateKey: historyCandidateKey(parsed.candidates[0]),
          analysisId: parsed.analysisId,
        },
      },
    ],
  };
  const calendarPath = '/api/calendars/' + record.id;
  await campus.write(
    calendarPath,
    {
      state,
      version: 1,
      catalogueRevision: fresh.currentCatalogueRevision,
    },
    'PUT',
  );
  const saved = await campus.read(calendarPath);
  assert.deepEqual(saved.state.events[0].historicalSource, state.events[0].historicalSource);
  const foreignRecord = await as('campus-b').write('/api/calendars', {
    campusId: 'b',
    year: 2027,
    modalities: ['integrado'],
    regime: 'anual',
    purpose: 'test',
    courses: 'Outro campus',
  });
  const foreignHistoryId = await client.run((ctx) =>
    ctx.db.insert('histories', {
      calendarId: foreignRecord.id,
      campusId: ids.campuses.b,
      modalities: foreignRecord.modalities,
      year: 2026,
      filename: 'outro.pdf',
      hash: '0'.repeat(64),
      notes: '',
      createdAt: Date.now(),
      unavailableFile: { sourceReference: 'test', reason: 'not_migrated' },
    }),
  );
  for (const forged of [
    { historyId: uploaded.id, page: 1, candidateKey: historyCandidateKey(parsed.candidates[0]) },
    { historyId: foreignHistoryId, page: 1 },
    { historyId: uploaded.id, page: 2 },
    { historyId: uploaded.id, page: 1, candidateKey: 'forged' },
  ]) {
    await assert.rejects(
      campus.write(
        calendarPath,
        {
          state: { ...state, events: [{ ...state.events[0], historicalSource: forged }] },
          version: 2,
          catalogueRevision: fresh.currentCatalogueRevision,
        },
        'PUT',
      ),
      /Referência histórica inválida|Missing required field `candidateKey`/,
    );
  }
  const full = await inspect();
  assert.equal(full.histories.filter((history) => history.calendarId === record.id).length, 1);
  assert.equal(full.histories[0].hash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(
    full.audit.filter((entry: { action: string }) => entry.action === 'ANALYZE_HISTORY').length,
    1,
  );
  assert(
    (await campus.read('/api/logs')).entries.some(
      (entry: { action: string }) => entry.action === 'Calendário anterior analisado',
    ),
  );
  await assert.rejects(
    foreign.action(api.actions.history.downloadHistory, { id: uploaded.id }),
    /Registro não encontrado/,
  );
  const ticket = await actor.action(api.actions.history.downloadHistory, { id: uploaded.id });
  assert.equal(ticket.filename, 'anterior-sintetico.pdf');
  assert.match(ticket.url, /\/files\/[a-f0-9]{64}$/);
  const admin = asClient('admin');
  const beforeCorruption = await actor.query(api.calendars.calendar, { id: record.id });
  for (const corrupt of [
    { campusId: ids.campuses.b, modalities: ['integrado' as const] },
    { campusId: ids.campuses.a, modalities: ['graduacao' as const] },
  ]) {
    await client.run((ctx) => ctx.db.patch(uploaded.id, corrupt));
    await assert.rejects(
      admin.query(api.histories.analysisVersions, { id: uploaded.id }),
      /incompatível/,
    );
    await assert.rejects(
      admin.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: beforeCorruption.version,
          catalogueRevision: beforeCorruption.catalogueRevision,
          state: beforeCorruption.state,
        },
      }),
      /Referência histórica inválida/,
    );
  }
});

afterEach(() => vi.useRealTimers());

test('reanalysis pins legacy evidence to its original immutable candidate and is idempotent', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  const { client, asClient, ids } = await createNativeFixture();
  const actor = asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Curso sintético',
      purpose: 'test',
    },
  });
  const bytes = syntheticPdf();
  const candidate = {
    page: 1,
    excerpt: '10/12/2026 Edital antigo preservado',
    name: 'Edital antigo preservado',
    dates: null,
    likelyLocal: false,
    category: 'evento',
  };
  const old = {
    version: 2,
    pages: [{ page: 1, text: candidate.excerpt }],
    candidates: [candidate],
    truncated: false,
    needsText: false,
    analyzedAt: '2026-10-01T00:00:00.000Z',
  };
  const { historyId, originalId } = await client.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    );
    const historyId = await ctx.db.insert('histories', {
      calendarId: record.id,
      campusId: ids.campuses.a,
      year: 2026,
      modalities: ['integrado'],
      storageId,
      filename: 'anterior.pdf',
      hash: createHash('sha256').update(bytes).digest('hex'),
      notes: '',
      createdAt: Date.now(),
    });
    const originalId = await ctx.db.insert('historyAnalyses', { historyId, analysis: old });
    return { historyId, originalId };
  });
  const source = { historyId, page: 1, candidateKey: historyCandidateKey(candidate) };
  const legacyEvent = {
    id: 'legacy-event',
    name: 'Referência antiga preservada',
    start: '2026-12-10',
    end: '2026-12-10',
    kind: 'note' as const,
    recordType: 'prior-reference' as const,
    evidence: 'Fonte sintética',
    modalities: ['integrado' as const],
    historicalSource: source,
  };
  // This source was already persisted before immutable analysis IDs existed.
  await client.run(async (ctx) => {
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique())!;
    await ctx.db.patch(content._id, { state: { ...content.state, events: [legacyEvent] } });
  });
  await assert.rejects(
    asClient('campus-b').action(api.actions.history.reanalyzeHistory, {
      id: historyId,
      extractorVersion: 3,
    }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    actor.action(api.actions.history.reanalyzeHistory, { id: historyId, extractorVersion: 99 }),
    /Versão do extrator/,
  );
  const [parsed, simultaneous] = await Promise.all([
    actor.action(api.actions.history.reanalyzeHistory, { id: historyId, extractorVersion: 3 }),
    actor.action(api.actions.history.reanalyzeHistory, { id: historyId, extractorVersion: 3 }),
  ]);
  assert.deepEqual(simultaneous, parsed);
  assert.equal(parsed.extractorVersion, 3);
  assert.notEqual(parsed.analysisId, originalId);
  assert(!parsed.candidates.some((item) => item.excerpt === candidate.excerpt));
  assert.deepEqual(
    await actor.action(api.actions.history.reanalyzeHistory, {
      id: historyId,
      extractorVersion: 3,
    }),
    parsed,
  );
  const original = await actor.query(api.histories.analysisVersions, {
    id: historyId,
    analysisId: originalId,
  });
  assert.equal(original.history.originalAnalysisId, originalId);
  assert.equal(original.history.latestAnalysisId, parsed.analysisId);
  assert.deepEqual(original.history.analysis?.candidates, old.candidates);
  const state = {
    ...record.state,
    events: [legacyEvent],
  };
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: { version: record.version, catalogueRevision: record.catalogueRevision, state },
  });
  assert.deepEqual(saved.state.events[0].historicalSource, source);
  await assert.rejects(
    actor.mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: saved.version,
        catalogueRevision: record.catalogueRevision,
        state: {
          ...state,
          events: [
            { ...state.events[0], historicalSource: { ...source, analysisId: parsed.analysisId } },
          ],
        },
      },
    }),
    /Referência histórica inválida/,
  );
  const stored = await client.run((ctx) => ctx.db.get(originalId));
  assert.deepEqual(stored?.analysis, old);
  const rows = await client.run((ctx) =>
    ctx.db
      .query('historyAnalyses')
      .withIndex('by_historyId', (q) => q.eq('historyId', historyId))
      .take(10),
  );
  assert.equal(rows.length, 2);
  const manifest = (await client.run((ctx) => ctx.db.get(historyId)))!.analysisVersions;
  assert.deepEqual(
    manifest?.map((item) => item.analysisId),
    [originalId, parsed.analysisId],
  );
  assert(
    manifest?.every(
      (item) => !('analysis' in item) && !('pages' in item) && !('candidates' in item),
    ),
  );
  const current = await actor.query(api.calendars.calendar, { id: record.id });
  assert(!('analysisVersions' in current.histories[0]));
});
