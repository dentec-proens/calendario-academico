import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Doc, Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';

type Page = { numItems: number; cursor: string | null };
type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
type Filters = {
  campusId?: Id<'campuses'>;
  status?: Doc<'calendars'>['status'];
  search?: string;
  deleted?: boolean;
};

function insertCalendar(f: Fixture, campus: 'a' | 'b', fields: Partial<Doc<'calendars'>>) {
  return f.client.run((ctx) =>
    ctx.db.insert('calendars', {
      campusId: f.ids.campuses[campus],
      year: 2027,
      offerKinds: ['integrado'],
      status: 'rascunho',
      statusRevision: 0,
      courses: '',
      classes: '',
      shifts: '',
      version: 1,
      updatedAt: 1,
      ...fields,
    }),
  );
}

async function reviewerClient(f: Fixture) {
  const identity = await f.client.run(async (ctx) => {
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
  return f.client.withIdentity(identity);
}

/** Reads like the client: page after page until the query says the calendars ended. */
async function readAll(
  client: ReturnType<Fixture['asClient']>,
  filters: Filters = {},
  numItems = 50,
) {
  const items = [];
  const pages = [];
  let cursor: Page['cursor'] = null;
  for (;;) {
    const result: {
      page: Array<{ id: string; name: string; status: string }>;
      isDone: boolean;
      continueCursor: string;
    } = await client.query(api.calendars.calendarPage, {
      ...filters,
      paginationOpts: { numItems, cursor },
    });
    pages.push(result.page.length);
    items.push(...result.page);
    if (result.isDone) return { items, pages };
    cursor = result.continueCursor;
  }
}

test('the live list follows the last change, however old the calendar is', async () => {
  const f = await createNativeFixture();
  const oldest = await insertCalendar(f, 'a', { label: 'Mais antigo', updatedAt: 300 });
  const newest = await insertCalendar(f, 'b', { label: 'Mais novo', updatedAt: 100 });
  const middle = await insertCalendar(f, 'a', { label: 'Do meio', updatedAt: 200 });
  const admin = f.asClient('admin');
  const everyCampus = await readAll(admin);
  expect(everyCampus.items.map((item) => item.id)).toEqual([oldest, middle, newest]);
  const oneCampus = await readAll(admin, { campusId: f.ids.campuses.a });
  expect(oneCampus.items.map((item) => item.id)).toEqual([oldest, middle]);
  // Editing moves a calendar to the top.
  await f.client.run((ctx) => ctx.db.patch(newest, { updatedAt: 400 }));
  expect((await readAll(admin)).items[0].id).toBe(newest);
});

test('search ignores case and accents across name, label, campus, courses, classes and shifts', async () => {
  const f = await createNativeFixture();
  await f.client.run((ctx) => ctx.db.patch(f.ids.campuses.a, { name: 'União da Vitória' }));
  const label = await insertCalendar(f, 'b', { label: 'Revisão Geral', updatedAt: 6 });
  const campus = await insertCalendar(f, 'a', { updatedAt: 5 });
  const course = await insertCalendar(f, 'b', { courses: 'Técnico em Informática', updatedAt: 4 });
  const classes = await insertCalendar(f, 'b', { classes: 'Turma ÁGIL', updatedAt: 3 });
  const shift = await insertCalendar(f, 'b', { shifts: 'Manhã', updatedAt: 2 });
  await insertCalendar(f, 'b', { year: 2028, updatedAt: 1 });
  const admin = f.asClient('admin');
  const found = async (search: string) =>
    (await readAll(admin, { search })).items.map((item) => item.id);
  expect(await found('REVISAO')).toEqual([label]);
  expect(await found('uniao da vitoria')).toEqual([campus]);
  expect(await found('informatica')).toEqual([course]);
  expect(await found('agil')).toEqual([classes]);
  expect(await found('manha')).toEqual([shift]);
  // Words may come from different fields, in any order.
  expect(await found('informatica 2027')).toEqual([course]);
  expect(await found('2028 informatica')).toEqual([]);
  // A blank search is no search.
  expect((await found('   ')).length).toBe(6);
});

test('a match beyond the first pages is reached, with empty pages on the way and no repeats', async () => {
  const f = await createNativeFixture();
  const rows = await f.client.run(async (ctx) => {
    const ids = [];
    for (let index = 0; index < 130; index++)
      ids.push(
        await ctx.db.insert('calendars', {
          campusId: f.ids.campuses.a,
          year: 2027,
          offerKinds: ['integrado'],
          status: 'rascunho',
          statusRevision: 0,
          label: `Lista ${index}`,
          courses: index % 60 === 5 ? 'Agroecologia' : 'Outro curso',
          classes: '',
          shifts: '',
          version: 1,
          updatedAt: 1_000 - index,
        }),
      );
    return ids;
  });
  const admin = f.asClient('admin');
  const first = await admin.query(api.calendars.calendarPage, {
    search: 'agroecologia',
    paginationOpts: { numItems: 3, cursor: null },
  });
  // The page is short and the list has not ended: the client must keep reading.
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  const { items } = await readAll(admin, { search: 'agroecologia' }, 25);
  expect(items.map((item) => item.id)).toEqual([rows[5], rows[65], rows[125]]);
});

test('the situation filter keeps the order and fills the pages, alone or with campus and search', async () => {
  const f = await createNativeFixture();
  const ids = [];
  for (let index = 0; index < 12; index++)
    ids.push(
      await insertCalendar(f, index % 2 ? 'a' : 'b', {
        status: index % 3 ? 'rascunho' : 'vigente',
        courses: index === 3 ? 'Química' : '',
        updatedAt: 100 - index,
      }),
    );
  const admin = f.asClient('admin');
  const published = await readAll(admin, { status: 'vigente' }, 2);
  expect(published.items.map((item) => item.id)).toEqual([ids[0], ids[3], ids[6], ids[9]]);
  expect(published.items.every((item) => item.status === 'vigente')).toBe(true);
  expect(published.pages.slice(0, 2)).toEqual([2, 2]);
  const campus = await readAll(admin, { status: 'vigente', campusId: f.ids.campuses.a });
  expect(campus.items.map((item) => item.id)).toEqual([ids[3], ids[9]]);
  const search = await readAll(admin, { status: 'vigente', search: 'quimica' });
  expect(search.items.map((item) => item.id)).toEqual([ids[3]]);
  expect((await readAll(admin, { status: 'rascunho', search: 'quimica' })).items).toEqual([]);
});

test('a campus only ever reaches its own calendars, whatever the filters ask for', async () => {
  const f = await createNativeFixture();
  const own = await insertCalendar(f, 'a', { courses: 'Enfermagem', status: 'vigente' });
  const foreign = await insertCalendar(f, 'b', { courses: 'Enfermagem', status: 'vigente' });
  const campus = f.asClient('campus-a');
  for (const filters of [
    { search: 'enfermagem' },
    { status: 'vigente' as const },
    { search: 'enfermagem', status: 'vigente' as const },
    // A search for the other campus's name finds nothing rather than revealing it.
    { search: 'calendário 2027 - campus' },
  ])
    expect((await readAll(campus, filters)).items.map((item) => item.id)).toEqual([own]);
  expect((await readAll(campus, { search: 'campus b' })).items).toEqual([]);
  for (const filters of [
    { campusId: f.ids.campuses.b },
    { campusId: f.ids.campuses.b, search: 'enfermagem' },
    { campusId: f.ids.campuses.b, status: 'vigente' as const },
  ])
    await expect(readAll(campus, filters)).rejects.toThrow(/Registro não encontrado/);
  // Its own campus named explicitly is fine.
  expect(
    (await readAll(campus, { campusId: f.ids.campuses.a, search: 'enfermagem' })).items[0].id,
  ).toBe(own);
  const admin = await readAll(f.asClient('admin'), { search: 'enfermagem' });
  expect(new Set(admin.items.map((item) => item.id))).toEqual(new Set([own, foreign]));
});

test('a reviewer searches every campus', async () => {
  const f = await createNativeFixture();
  const a = await insertCalendar(f, 'a', { courses: 'Direito', status: 'enviado', updatedAt: 2 });
  const b = await insertCalendar(f, 'b', { courses: 'Direito', status: 'vigente', updatedAt: 1 });
  const reviewer = await reviewerClient(f);
  expect((await readAll(reviewer, { search: 'direito' })).items.map((item) => item.id)).toEqual([
    a,
    b,
  ]);
  expect(
    (await readAll(reviewer, { search: 'direito', status: 'vigente' })).items.map(
      (item) => item.id,
    ),
  ).toEqual([b]);
  expect(
    (await readAll(reviewer, { campusId: f.ids.campuses.a })).items.map((item) => item.id),
  ).toEqual([a]);
});

test('the trash stays out of the live search and keeps its own order', async () => {
  const f = await createNativeFixture();
  const live = await insertCalendar(f, 'a', { courses: 'Física', updatedAt: 1 });
  const firstDeleted = await insertCalendar(f, 'a', {
    courses: 'Física',
    updatedAt: 9,
    deletedAt: 100,
  });
  const lastDeleted = await insertCalendar(f, 'a', {
    courses: 'Física',
    updatedAt: 2,
    deletedAt: 200,
  });
  const admin = f.asClient('admin');
  expect((await readAll(admin, { search: 'fisica' })).items.map((item) => item.id)).toEqual([live]);
  expect(
    (await readAll(admin, { deleted: true, search: 'fisica' })).items.map((item) => item.id),
  ).toEqual([lastDeleted, firstDeleted]);
  expect(
    (await readAll(f.asClient('campus-a'), { deleted: true })).items.map((item) => item.id),
  ).toEqual([lastDeleted, firstDeleted]);
});
