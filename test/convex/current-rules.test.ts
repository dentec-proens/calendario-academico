import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import { inspectCalendar } from '../../src/domain/calendar/base.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, seedCourses } from '../helpers/lifecycle.ts';
import type { Id } from '../../convex/_generated/dataModel';

const previousRules = 'consup-292-2027-v6';

async function draftUnderOldRules() {
  const fixture = await createNativeFixture({
    catalogue: {
      revision: 1,
      events: [
        {
          id: 'holiday',
          name: 'Feriado',
          start: civilDate('2027-03-02'),
          end: civilDate('2027-03-02'),
          effect: 'exclude',
          category: 'feriado',
          evidence: 'Portaria',
          modalities: ['integrado'],
          active: true,
        },
      ],
    },
  });
  const account = fixture.asClient('admin');
  const record = await account
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a!,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  await seedCourses(fixture, record.id);
  await stampRules(fixture, record.id as Id<'calendars'>, previousRules);
  const current = rulesetVersion(record.state);
  return { ...fixture, account, record, current };
}

async function stampRules(
  { client }: Awaited<ReturnType<typeof createNativeFixture>>,
  id: Id<'calendars'>,
  version: string,
) {
  await client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique();
    await ctx.db.patch(content!._id, { state: { ...content!.state, rulesetVersion: version } });
  });
}

async function publishDocument({
  client,
  account,
}: Awaited<ReturnType<typeof draftUnderOldRules>>) {
  const id = await client.run((ctx) =>
    ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Nova norma',
      source: 'PROENS',
      hash: '1'.repeat(64),
      filename: 'norma.pdf',
      status: 'rascunho',
      version: 1,
      createdAt: Date.now(),
    }),
  );
  await account.mutation(api.documents.documentStatus, {
    id,
    revision: 1,
    status: 'vigente',
    confirmed: true,
  });
  return id;
}

test('a draft under older rules and references saves without any acceptance', async () => {
  const fixture = await draftUnderOldRules();
  const { account, record, current } = fixture;
  const document = await publishDocument(fixture);
  const fresh = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  const assessment = inspectCalendar(fresh, fresh);
  expect(assessment.compatible).toBe(true);
  expect(assessment.kind).toBe('documents');
  expect(assessment.rules.after).toBe(current);
  expect(assessment.rules.changes.map((change) => change.version)).toContain(current);
  const saved = await account
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: fresh.version,
        catalogueRevision: fresh.currentCatalogueRevision,
        state: { ...fresh.state, rulesetVersion: current },
      },
    })
    .then(calendarSaveDates);
  expect(saved.version).toBe(fresh.version + 1);
  expect(saved.state.rulesetVersion).toBe(current);
  const after = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  expect(after.documentSnapshot.map((item) => item.id)).toEqual([document]);
  expect(inspectCalendar(after, after).kind).toBe('current');
});

test('submitting records the current rules and references, and the review can go on', async () => {
  const fixture = await draftUnderOldRules();
  const { account, record, current, client, inspect } = fixture;
  const document = await publishDocument(fixture);
  await act(account, record.id, 'submit');
  const after = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  expect(after.status).toBe('enviado');
  expect(after.version).toBe(record.version + 1);
  expect(after.state.rulesetVersion).toBe(current);
  expect(inspectCalendar(after, after).compatible, 'not born outdated').toBe(true);
  const [submission] = await client.run((ctx) => ctx.db.query('calendarSubmissions').collect());
  expect(submission!.contentVersion).toBe(after.version);
  expect(submission!.state.rulesetVersion).toBe(current);
  expect(submission!.documentSnapshot.map((item) => item.id)).toEqual([document]);
  const audit = (await inspect()).audit.filter((row) => row.calendarId === record.id);
  expect(
    audit.find((row) => row.action === 'SAVE_CALENDAR' && row.version === after.version),
    'the stamp keeps its authorship',
  ).toBeTruthy();
});

test('rules changed during the review still block concluding and publishing', async () => {
  const fixture = await draftUnderOldRules();
  const { account, record } = fixture;
  await act(account, record.id, 'submit');
  await fixture.client.run((ctx) =>
    ctx.db.patch(record.id as Id<'calendars'>, { status: 'em_revisao' }),
  );
  await stampRules(fixture, record.id as Id<'calendars'>, previousRules);
  const locked = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  const assessment = inspectCalendar(locked, locked);
  expect(assessment.kind).toBe('rules');
  expect(assessment.compatible).toBe(false);
  await expect(act(account, record.id, 'conclude')).rejects.toThrow('Devolva o calendário');
});

test('a new version starts under the current rules and references', async () => {
  const fixture = await draftUnderOldRules();
  const { account, record, client, current } = fixture;
  const document = await publishDocument(fixture);
  await client.run((ctx) =>
    ctx.db.patch(record.id as Id<'calendars'>, { status: 'vigente', statusRevision: 9 }),
  );
  const copy = await account
    .mutation(api.calendars.createCalendarVersion, { id: record.id })
    .then(calendarRecordDates);
  expect(copy.state.rulesetVersion).toBe(current);
  expect(copy.documentSnapshot.map((item) => item.id)).toEqual([document]);
  expect(inspectCalendar(copy, copy).documents.added).toEqual([]);
});

async function withNewEvent() {
  const context = await draftUnderOldRules();
  await context.account.mutation(api.catalogue.saveCatalogue, {
    body: {
      revision: 1,
      name: 'Feriado novo',
      start: civilDate('2027-03-09'),
      end: civilDate('2027-03-09'),
      effect: 'exclude',
      category: 'feriado',
      evidence: 'Portaria',
      modalities: ['integrado'],
      active: true,
    },
  });
  return context;
}

test('a catalogue change writes nothing until a person saves', async () => {
  const { account, record } = await withNewEvent();
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  expect(fresh.version).toBe(record.version);
  expect(fresh.institutionalSnapshot.map(({ name }) => name)).not.toContain('Feriado novo');
  expect(fresh.institutionalEvents.map(({ name }) => name)).toContain('Feriado novo');
});

test('a submission of a base the person did not see is refused without writing', async () => {
  const { account, record } = await withNewEvent();
  const seen = inspectCalendar(record, record).identity;
  await expect(act(account, record.id, 'submit', { baseIdentity: seen })).rejects.toThrow(
    'Confira o calendário e envie novamente',
  );
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  expect(fresh).toMatchObject({ status: 'rascunho', version: record.version });
});

test('a tab from before this check is asked to update', async () => {
  const { account, record } = await draftUnderOldRules();
  await expect(
    account.mutation(api.calendars.transitionCalendar, {
      id: record.id,
      from: record.status,
      statusRevision: record.statusRevision,
      action: 'submit',
    }),
  ).rejects.toThrow('Atualize a aplicação');
});

test('submitting what was seen records the current base first, so publication can compare it', async () => {
  const { account, record } = await withNewEvent();
  await act(account, record.id, 'submit');
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  expect(fresh.version).toBe(record.version + 1);
  expect(fresh.status).toBe('enviado');
  expect(fresh.institutionalSnapshot.map(({ name }) => name)).toContain('Feriado novo');
  expect(inspectCalendar(calendarRecordDates(fresh), calendarRecordDates(fresh)).kind).toBe(
    'current',
  );
});

test('the administration sees the reach of a catalogue change before saving', async () => {
  const { account, record } = await draftUnderOldRules();
  const body = {
    revision: 1,
    name: 'Feriado novo',
    start: civilDate('2027-03-09'),
    end: civilDate('2027-03-09'),
    effect: 'exclude' as const,
    category: 'feriado' as const,
    evidence: 'Portaria',
    modalities: ['integrado' as const],
    active: true,
  };
  await expect(account.query(api.catalogue.catalogueImpact, { body })).resolves.toMatchObject({
    reached: 1,
  });
  const other = { ...body, modalities: ['graduacao' as const] };
  await expect(
    account.query(api.catalogue.catalogueImpact, { body: other }),
  ).resolves.toMatchObject({
    reached: 0,
  });
  await act(account, record.id, 'submit');
  await expect(account.query(api.catalogue.catalogueImpact, { body })).resolves.toMatchObject({
    reached: 0,
  });
});

test('moving an event to another year counts the calendars that lose it', async () => {
  const { account, client } = await withNewEvent();
  const stored = await client.run((ctx) =>
    ctx.db
      .query('institutionalEvents')
      .withIndex('by_year', (q) => q.eq('year', 2027))
      .first(),
  );
  const body = {
    id: stored!.code,
    revision: 2,
    name: stored!.name,
    start: civilDate('2028-03-09'),
    end: civilDate('2028-03-09'),
    effect: stored!.effect,
    category: stored!.category,
    evidence: stored!.evidence,
    modalities: stored!.modalities,
    active: true,
  };
  await expect(account.query(api.catalogue.catalogueImpact, { body })).resolves.toMatchObject({
    reached: 1,
    partial: false,
  });
});

test('the audit says what changed in the catalogue', async () => {
  const { account } = await withNewEvent();
  const { entries } = await account.query(api.workspace.logs, {
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(entries[0]!.action).toBe(
    'Base institucional alterada: Feriado novo, 2027-03-09: incluído',
  );
});

test('a returned calendar can be submitted again from the review page', async () => {
  const { account, record } = await draftUnderOldRules();
  await act(account, record.id, 'submit');
  await act(account, record.id, 'return', { note: 'Ajustar.' });
  const page = await account.query(api.reviews.review, { id: record.id });
  await act(account, record.id, 'submit', { baseIdentity: page.baseIdentity });
  const fresh = await account.query(api.calendars.calendar, { id: record.id });
  expect(fresh.status).toBe('enviado');
});
