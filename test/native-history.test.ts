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
});

afterEach(() => vi.useRealTimers());
