import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, calendarStatus } from '../helpers/lifecycle.ts';

const blank = { courses: '', classes: '', shifts: '' };

async function fixture() {
  const f = await createNativeFixture();
  const campus = f.asClient('campus-a');
  const create = async () =>
    (
      await campus.mutation(api.calendars.createCalendar, {
        body: {
          campusId: f.ids.campuses.a,
          year: 2027,
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
  expect(created.record.name).toBe('Calendário 2027 - Campus A');
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
    name: 'Calendário 2027 - Campus A',
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

  await f.rename(f.campus, id, '   ');
  const cleared = await calendarStatus(f.campus, id);
  expect(cleared.record.label).toBeUndefined();
  expect(cleared.record.name).toBe('Calendário 2027 - Campus A');
});

test('renaming follows the calendar locks, the campus scope and the length limit', async () => {
  const f = await fixture();
  const id = await f.create();
  await expect(f.rename(f.asClient('campus-b'), id, 'Alheio')).rejects.toThrow();
  await expect(f.rename(f.campus, id, 'x'.repeat(121))).rejects.toThrow(/até 120 caracteres/);
  await f.identify(f.campus, id, { courses: 'Curso' });
  await act(f.campus, id, 'submit');
  await expect(f.rename(f.campus, id, 'Proposta B')).rejects.toThrow(
    /enviado e não pode ser alterado/,
  );
  expect((await calendarStatus(f.campus, id)).record.name).toBe('Calendário 2027 - Campus A');
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
