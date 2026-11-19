import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, calendarStatus } from '../helpers/lifecycle.ts';

const blank = { courses: '', classes: '', shifts: '' };

async function fixture() {
  const f = await createNativeFixture();
  const campus = f.asClient('campus-a');
  // Calendars of the same campus and year need distinct labels.
  let created = 0;
  const create = async (label = `Rascunho ${++created}`) =>
    (
      await campus.mutation(api.calendars.createCalendar, {
        body: {
          campusId: f.ids.campuses.a,
          year: 2027,
          label,
          offers: [{ kind: 'integrado', organization: 'anual' }],
        },
      })
    ).id;
  /** The identity stored now, as a form opened at this moment would start from. */
  const stored = async (id: Id<'calendars'>) => {
    const row = await f.client.run((ctx) => ctx.db.get(id));
    return {
      courses: row!.courses,
      classes: row!.classes,
      shifts: row!.shifts,
    };
  };
  const identify = async (
    client: typeof campus,
    id: Id<'calendars'>,
    body: Partial<typeof blank> = {},
  ) =>
    client.mutation(api.calendars.updateCalendarIdentity, {
      id,
      expected: await stored(id),
      body: { ...blank, ...body },
    });
  const rename = async (client: typeof campus, id: Id<'calendars'>, label: string) =>
    client.mutation(api.calendars.renameCalendar, {
      id,
      expected: (await f.client.run((ctx) => ctx.db.get(id)))!.label ?? '',
      label,
    });
  const audited = (id: Id<'calendars'>, action: string) =>
    f.client.run((ctx) =>
      ctx.db
        .query('audit')
        .withIndex('by_calendarId_and_action_and_at', (q) =>
          q.eq('calendarId', id).eq('action', action),
        )
        .collect(),
    );
  return { ...f, campus, create, identify, rename, stored, audited };
}

test('a calendar starts without courses, which are required only to submit', async () => {
  const f = await fixture();
  const id = await f.create();
  const created = await calendarStatus(f.campus, id);
  expect(created.record).toMatchObject({ courses: '', classes: '', shifts: '' });
  expect(created.record.name).toBe('Calendário 2027 - Campus A — Rascunho 1');
  await expect(act(f.campus, id, 'submit')).rejects.toThrow(/Informe os cursos/);

  await f.identify(f.campus, id, {
    courses: '  Técnico em Informática  ',
    classes: '1º ano A',
    shifts: 'matutino',
  });
  const identified = await calendarStatus(f.campus, id);
  expect(identified.record).toMatchObject({
    courses: 'Técnico em Informática',
    classes: '1º ano A',
    shifts: 'matutino',
    name: 'Calendário 2027 - Campus A — Rascunho 1',
  });
  expect(identified.record.version, 'identity keeps the content version').toBe(1);
  await act(f.campus, id, 'submit');
  expect((await calendarStatus(f.campus, id)).status).toBe('enviado');
});

test('identity follows the calendar locks and the campus scope', async () => {
  const f = await fixture();
  const id = await f.create();
  await expect(
    f.identify(f.asClient('campus-b'), id, { courses: 'Curso alheio' }),
  ).rejects.toThrow();
  await expect(f.identify(f.campus, id, { courses: 'x'.repeat(1001) })).rejects.toThrow(
    /até 1000 caracteres/,
  );
  await f.identify(f.campus, id, { courses: 'Curso' });
  await act(f.campus, id, 'submit');
  await expect(f.identify(f.campus, id, { courses: 'Outro curso' })).rejects.toThrow(
    /enviado e não pode ser alterado/,
  );
  expect((await calendarStatus(f.campus, id)).record.courses).toBe('Curso');
});

test('the identity change is attributed and audited without a new content version', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.identify(f.asClient('admin'), id, { courses: 'Curso' });
  const { record } = await calendarStatus(f.campus, id);
  expect(record.createdByName).toBe('Campus A');
  expect(record.updatedByName).toBe('Admin');
  const audit = await f.client.run((ctx) =>
    ctx.db
      .query('audit')
      .withIndex('by_calendarId_and_action_and_at', (q) =>
        q.eq('calendarId', id).eq('action', 'UPDATE_CALENDAR_IDENTITY'),
      )
      .collect(),
  );
  expect(audit).toHaveLength(1);
  expect(audit[0].version).toBe(1);

  await f.identify(f.campus, id, { courses: 'Curso' });
  const unchanged = await f.client.run((ctx) =>
    ctx.db
      .query('audit')
      .withIndex('by_calendarId_and_action_and_at', (q) =>
        q.eq('calendarId', id).eq('action', 'UPDATE_CALENDAR_IDENTITY'),
      )
      .collect(),
  );
  expect(unchanged, 'an unchanged identity writes nothing').toHaveLength(1);
});

test('a change from another session is reported instead of overwritten', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.identify(f.campus, id, { courses: 'Curso' });
  const opened = await f.stored(id);
  await f.identify(f.asClient('admin'), id, { courses: 'Curso corrigido' });
  await expect(
    f.campus.mutation(api.calendars.updateCalendarIdentity, {
      id,
      expected: opened,
      body: { ...opened, classes: '1º ano A' },
    }),
  ).rejects.toThrow(/alterada em outra sessão/);
  expect((await calendarStatus(f.campus, id)).record.courses).toBe('Curso corrigido');
  // Saving what is already stored is not a conflict.
  await f.campus.mutation(api.calendars.updateCalendarIdentity, {
    id,
    expected: opened,
    body: await f.stored(id),
  });
});

test('renaming changes only the label after campus and year', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.rename(f.campus, id, ' Proposta A ');
  const renamed = await calendarStatus(f.campus, id);
  expect(renamed.record).toMatchObject({
    label: 'Proposta A',
    name: 'Calendário 2027 - Campus A — Proposta A',
  });
  expect(renamed.record.version, 'renaming keeps the content version').toBe(1);

  await expect(f.rename(f.campus, id, '   ')).rejects.toThrow(
    /Informe o complemento do nome para distinguir este calendário/,
  );
  expect((await calendarStatus(f.campus, id)).record.label).toBe('Proposta A');
});

test('creation requires a label distinct in the campus and year, and a refusal creates nothing', async () => {
  const f = await fixture();
  const stored = () =>
    f.client.run(async (ctx) => ({
      calendars: (await ctx.db.query('calendars').collect()).length,
      contents: (await ctx.db.query('calendarContents').collect()).length,
    }));
  await expect(f.create('   ')).rejects.toThrow(
    'Informe o complemento do nome para distinguir este calendário dos demais do campus.',
  );
  expect(await stored()).toEqual({ calendars: 0, contents: 0 });

  const id = await f.create('  Cursos Bimestrais  ');
  expect((await calendarStatus(f.campus, id)).record).toMatchObject({
    label: 'Cursos Bimestrais',
    name: 'Calendário 2027 - Campus A — Cursos Bimestrais',
  });
  // Case and accents do not tell two labels apart, as in a search.
  await expect(f.create(' cursos bimestráis ')).rejects.toThrow(
    'Já há Calendário 2027 - Campus A — Cursos Bimestrais neste campus e ano. Escolha outro complemento do nome.',
  );
  expect(await stored()).toEqual({ calendars: 1, contents: 1 });

  // Another campus or year keeps its own names.
  const elsewhere = async (client: typeof f.campus, campusId: Id<'campuses'>, year: number) =>
    (
      await client.mutation(api.calendars.createCalendar, {
        body: {
          campusId,
          year,
          label: 'Cursos bimestrais',
          offers: [{ kind: 'integrado', organization: 'anual' }],
        },
      })
    ).id;
  const foreign = await elsewhere(f.asClient('campus-b'), f.ids.campuses.b, 2027);
  const nextYear = await elsewhere(f.campus, f.ids.campuses.a, 2028);
  for (const other of [foreign, nextYear])
    expect((await calendarStatus(f.asClient('admin'), other)).record.label).toBe(
      'Cursos bimestrais',
    );
  expect(await stored()).toEqual({ calendars: 3, contents: 3 });
});

test('a label repeated in the campus and year is refused, except between a version and its origin', async () => {
  const f = await fixture();
  const admin = f.asClient('admin');
  const origin = await f.create('Cursos bimestrais');
  const other = await f.create();
  // Case and accents do not tell two labels apart, as in a search.
  await expect(f.rename(f.campus, other, ' CURSOS BIMESTRÁIS ')).rejects.toThrow(
    'Já há Calendário 2027 - Campus A — Cursos bimestrais neste campus e ano. Escolha outro complemento do nome.',
  );
  // Another campus or year keeps its own names.
  const foreign = (
    await f.asClient('campus-b').mutation(api.calendars.createCalendar, {
      body: {
        campusId: f.ids.campuses.b,
        year: 2027,
        label: 'Cursos integrados',
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
  ).id;
  await f.rename(f.asClient('campus-b'), foreign, 'Cursos bimestrais');
  const nextYear = (
    await f.campus.mutation(api.calendars.createCalendar, {
      body: {
        campusId: f.ids.campuses.a,
        year: 2028,
        label: 'Cursos integrados',
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
  ).id;
  await f.rename(f.campus, nextYear, 'Cursos bimestrais');

  // A version keeps the label of the origin it replaces; sibling versions must differ.
  await f.client.run((ctx) => ctx.db.patch(origin, { status: 'vigente', statusRevision: 1 }));
  const version = (await f.campus.mutation(api.calendars.createCalendarVersion, { id: origin })).id;
  const sibling = (await f.campus.mutation(api.calendars.createCalendarVersion, { id: origin })).id;
  await f.rename(f.campus, version, 'Outro nome');
  await expect(f.rename(f.campus, version, 'Cursos Bimestrais')).rejects.toThrow(
    'Já há Calendário 2027 - Campus A — Cursos bimestrais neste campus e ano.',
  );
  await f.rename(f.campus, sibling, 'Cursos trimestrais');
  await f.rename(f.campus, version, 'Cursos Bimestrais');
  expect((await calendarStatus(f.campus, version)).record.label).toBe('Cursos Bimestrais');
  await expect(f.rename(admin, other, 'cursos trimestrais')).rejects.toThrow(
    'Já há Calendário 2027 - Campus A — Cursos trimestrais neste campus e ano.',
  );

  // An archived calendar or one in the trash no longer holds its name.
  await f.client.run((ctx) => ctx.db.patch(origin, { status: 'arquivado' }));
  await f.client.run((ctx) => ctx.db.patch(version, { deletedAt: Date.now() }));
  await f.rename(f.campus, other, 'Cursos bimestrais');
  expect((await calendarStatus(f.campus, other)).record.label).toBe('Cursos bimestrais');
});

test('the campus renames only while it edits; the administration in any state', async () => {
  const f = await fixture();
  const id = await f.create();
  await expect(f.rename(f.asClient('campus-b'), id, 'Alheio')).rejects.toThrow();
  await expect(f.rename(f.campus, id, 'x'.repeat(121))).rejects.toThrow(/até 120 caracteres/);
  await f.rename(f.campus, id, 'Proposta A');
  await f.identify(f.campus, id, { courses: 'Curso' });
  await act(f.campus, id, 'submit');
  await expect(f.rename(f.campus, id, 'Proposta B')).rejects.toThrow(
    /enviado e não pode ser alterado/,
  );
  expect((await calendarStatus(f.campus, id)).record.name).toBe(
    'Calendário 2027 - Campus A — Proposta A',
  );
  // The name is outside the submitted content: the administration corrects it, audited.
  await f.rename(f.asClient('admin'), id, 'Proposta B');
  const sent = await calendarStatus(f.campus, id);
  expect(sent.status).toBe('enviado');
  expect(sent.record.name).toBe('Calendário 2027 - Campus A — Proposta B');
  expect(await f.audited(id, 'RENAME_CALENDAR')).toHaveLength(2);
});

test('renaming is attributed and audited, and a rename from another session is not overwritten', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.rename(f.asClient('admin'), id, 'Proposta A');
  expect((await calendarStatus(f.campus, id)).record.updatedByName).toBe('Admin');
  expect(await f.audited(id, 'RENAME_CALENDAR')).toHaveLength(1);
  await f.rename(f.campus, id, 'Proposta A');
  expect(await f.audited(id, 'RENAME_CALENDAR'), 'an unchanged name writes nothing').toHaveLength(
    1,
  );

  await expect(
    f.campus.mutation(api.calendars.renameCalendar, { id, expected: '', label: 'Proposta B' }),
  ).rejects.toThrow(/alterado em outra sessão/);
  expect((await calendarStatus(f.campus, id)).record.label).toBe('Proposta A');
});
