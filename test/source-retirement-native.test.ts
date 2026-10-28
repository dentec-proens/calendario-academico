import { expect, test } from 'vitest';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { withoutManualSources } from '../src/manual-sources.ts';

const secret = 'Fonte manual a retirar integralmente';

test('old payloads cannot persist manual sources, including copies and historical restoration', async () => {
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const created = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Sintético',
      purpose: 'test',
    },
  });
  const state = {
    ...created.state,
    weekConfirmed: true,
    weekdays: [1, 2, 3, 4, 5],
    weekEvidence: secret,
    scopeConfirmation: { status: 'covered' as const, source: secret },
    intakeByModality: {
      integrado: { annual: { status: 'yes' as const, required: true, source: secret } },
    },
    teacherVacations: { firstStart: '2027-01-04', firstEnd: '2027-01-15', evidence: secret },
    organizationByModality: { integrado: 'anual' as const },
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: '2027-02-01',
        end: '2027-12-17',
        association: {
          status: 'defined' as const,
          modalities: ['integrado' as const],
          term: 'annual' as const,
        },
      },
    ],
    events: [
      {
        id: 'notice',
        name: 'Edital',
        start: '2027-07-01',
        end: '2027-07-10',
        kind: 'note' as const,
        evidence: secret,
        modalities: ['integrado' as const],
        requirementId: 'regular-admission-notice',
        publicationStatus: 'planned' as const,
        admission: { type: 'regular' as const, year: 2028, term: 'annual' as const },
        deadlineAdjustment: { date: '2027-07-20', reviewed: false, evidence: secret },
      },
    ],
  };
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: { version: created.version, catalogueRevision: created.currentCatalogueRevision, state },
  });
  expect(JSON.stringify(saved)).not.toContain(secret);
  expect(
    saved.state.events.every((event) =>
      event.evidence.includes(`registro:${created.id}:v${saved.version}:`),
    ),
  ).toBe(true);
  const unchanged = await actor.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: saved.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: { ...saved.state, weekEvidence: 'Outra fonte ignorada' },
      unchangedOnly: true,
    },
  });
  expect(unchanged.unchanged).toBe(true);
  expect(unchanged.version).toBe(saved.version);
  // Restoring the public historical DTO must not write its technical compatibility slots.
  const initial = await actor.query(api.calendars.calendarVersion, {
    id: created.id,
    version: created.version,
  });
  await actor.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: saved.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: initial.state,
    },
  });
  const raw = await fixture.client.run(async (ctx) => ({
    contents: await ctx.db.query('calendarContents').take(10),
    snapshots: await ctx.db.query('calendarSnapshots').take(10),
  }));
  for (const row of [...raw.contents, ...raw.snapshots])
    expect(withoutManualSources(row.state).removed).toBe(0);
  expect(JSON.stringify(raw)).not.toContain(secret);
  expect(raw.contents[0].institutionalSnapshot).toEqual(created.institutionalSnapshot);
});

test('unchanged smoke ignores legacy sources without mutating rows pending the verified cleanup', async () => {
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
  const legacy = await fixture.client.run(async (ctx) => {
    const row = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique();
    if (!row) throw Error('Conteúdo ausente');
    const value = { ...row, state: { ...row.state, weekEvidence: secret } };
    await ctx.db.patch(row._id, { state: value.state });
    return value;
  });
  const read = await actor.query(api.calendars.calendar, { id: record.id });
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: record.version,
      catalogueRevision: record.currentCatalogueRevision,
      state: read.state,
      unchangedOnly: true,
    },
  });
  expect(saved.unchanged).toBe(true);
  expect(saved.version).toBe(record.version);
  expect(await fixture.client.run((ctx) => ctx.db.get(legacy._id))).toEqual(legacy);
  expect(JSON.stringify(read)).not.toContain(secret);
});
