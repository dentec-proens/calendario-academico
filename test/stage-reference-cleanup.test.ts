import { test, expect } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api, internal } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { withoutStageReferences } from '../src/stage-references.ts';

const commit = 'a'.repeat(40);
const backupSha256 = 'b'.repeat(64);

test('cleanup removes sources only from stages and keeps unrelated source text and original input', () => {
  const state = {
    events: [
      {
        id: 'stage',
        name: 'Etapa',
        kind: 'note',
        start: '2027-03-01',
        end: '2027-03-12',
        evidence: 'Ata de etapa',
        requirementId: 'stage-1:integrado',
      },
      {
        id: 'legacy',
        name: 'Etapa antiga',
        kind: 'note',
        start: '2026-03-01',
        end: '2026-03-12',
        evidence: 'Ata histórica',
        requirementId: 'stage-start-1',
      },
      {
        id: 'other',
        name: 'Outro',
        kind: 'note',
        start: '2027-03-01',
        end: '2027-03-01',
        evidence: 'Ata de etapa',
      },
    ],
  };
  const before = structuredClone(state);
  const result = withoutStageReferences(state);
  expect(result.removed).toBe(2);
  expect(result.state.events.slice(0, 2).every((event) => !Object.hasOwn(event, 'evidence'))).toBe(
    true,
  );
  expect(result.state.events[2]).toEqual(before.events[2]);
  expect(state).toEqual(before);
  expect(withoutStageReferences(result.state).removed).toBe(0);
});

test('bounded native cleanup previews then removes current and historical stage references with maintenance and backup gates', async () => {
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Sintético',
      purpose: 'test',
    },
  });
  await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: record.version,
      catalogueRevision: record.catalogueRevision,
      state: {
        ...record.state,
        events: [
          {
            id: 'seed',
            name: 'Evento',
            kind: 'note',
            start: '2027-03-01',
            end: '2027-03-01',
            evidence: 'Fonte',
          },
        ],
      },
    },
  });
  const before = await fixture.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique();
    if (!content) throw Error('Conteúdo ausente');
    const events = [
      {
        id: 'stage',
        name: 'Etapa',
        kind: 'note' as const,
        start: '2027-03-01',
        end: '2027-03-12',
        evidence: 'Ata',
        requirementId: 'stage-1:integrado',
      },
      {
        id: 'other',
        name: 'Evento',
        kind: 'note' as const,
        start: '2027-03-01',
        end: '2027-03-01',
        evidence: 'Fonte conservada',
      },
    ];
    await ctx.db.patch(content._id, { state: { ...content.state, events } });
    const firstSnapshot = await ctx.db.query('calendarSnapshots').first();
    if (!firstSnapshot) throw Error('Snapshot ausente');
    const { _id: _snapshotId, _creationTime: _created, ...snapshotBody } = firstSnapshot;
    // More than one page, including snapshots that are not referenced by a version.
    for (let index = 0; index < 11; index++)
      await ctx.db.insert('calendarSnapshots', {
        ...snapshotBody,
        at: snapshotBody.at + index + 1,
      });
    const snapshots = await ctx.db.query('calendarSnapshots').take(30);
    for (const snapshot of snapshots)
      await ctx.db.patch(snapshot._id, { state: { ...snapshot.state, events } });
    return {
      contents: [{ ...content, state: { ...content.state, events } }],
      snapshots: snapshots.map((snapshot) => ({
        ...snapshot,
        state: { ...snapshot.state, events },
      })),
    };
  });
  const cleanup = internal.maintenance.stageReferences.removePage;
  for (const table of ['calendarContents', 'calendarSnapshots'] as const) {
    const preview = await fixture.client.mutation(cleanup, { table, cursor: null, dryRun: true });
    expect(preview.removed).toBeGreaterThan(0);
    await expect(
      fixture.client.mutation(cleanup, {
        table,
        cursor: null,
        dryRun: false,
        commit,
        backupSha256,
      }),
    ).rejects.toThrow(/manutenção exclusiva/);
  }
  await fixture.client.mutation(internal.operations.pause, { commit });
  await expect(
    fixture.client.mutation(cleanup, {
      table: 'calendarContents',
      cursor: null,
      dryRun: false,
      commit,
    }),
  ).rejects.toThrow(/backup integral/);
  const lease = await fixture.client.run((ctx) =>
    ctx.db.insert('operationalLeases', { operation: 'teste', startedAt: Date.now() }),
  );
  await expect(
    fixture.client.mutation(cleanup, {
      table: 'calendarContents',
      cursor: null,
      dryRun: false,
      commit,
      backupSha256,
    }),
  ).rejects.toThrow(/drenagem/);
  await fixture.client.run((ctx) => ctx.db.delete(lease));
  for (const table of ['calendarContents', 'calendarSnapshots'] as const) {
    let cursor: string | null = null;
    for (;;) {
      const result: FunctionReturnType<typeof cleanup> = await fixture.client.mutation(cleanup, {
        table,
        cursor,
        dryRun: false,
        commit,
        backupSha256,
      });
      if (result.done) break;
      cursor = result.cursor;
    }
    expect(
      (await fixture.client.mutation(cleanup, { table, cursor: null, dryRun: true })).removed,
    ).toBe(0);
  }
  const after = await fixture.client.run(async (ctx) => ({
    contents: await ctx.db.query('calendarContents').take(10),
    snapshots: await ctx.db.query('calendarSnapshots').take(30),
  }));
  for (const key of ['contents', 'snapshots'] as const) {
    expect(after[key]).toEqual(
      before[key].map((row) => ({ ...row, state: withoutStageReferences(row.state).state })),
    );
  }
});
