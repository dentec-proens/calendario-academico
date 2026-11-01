import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, calendarStatus } from '../helpers/lifecycle.ts';

const blank = { courses: '', classes: '', shifts: '', label: '' };

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
      label: row!.label ?? '',
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
  return { ...f, campus, create, identify, stored };
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
    label: ' Proposta A ',
  });
  const identified = await calendarStatus(f.campus, id);
  expect(identified.record).toMatchObject({
    courses: 'Técnico em Informática',
    classes: '1º ano A',
    shifts: 'matutino',
    label: 'Proposta A',
    name: 'Calendário 2027 - Campus A — Proposta A',
  });
  expect(identified.record.version, 'identity keeps the content version').toBe(1);
  await act(f.campus, id, 'submit');
  expect((await calendarStatus(f.campus, id)).status).toBe('enviado');
});

test('clearing the label restores the default name', async () => {
  const f = await fixture();
  const id = await f.create();
  await f.identify(f.campus, id, { courses: 'Curso', label: 'Proposta A' });
  await f.identify(f.campus, id, { courses: 'Curso' });
  const { record } = await calendarStatus(f.campus, id);
  expect(record.label).toBeUndefined();
  expect(record.name).toBe('Calendário 2027 - Campus A');
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
  await f.identify(f.campus, id, { courses: 'Curso', label: 'Proposta A' });
  const opened = await f.stored(id);
  await f.identify(f.asClient('admin'), id, { courses: 'Curso corrigido', label: 'Proposta A' });
  await expect(
    f.campus.mutation(api.calendars.updateCalendarIdentity, {
      id,
      expected: opened,
      body: { ...opened, label: 'Proposta B' },
    }),
  ).rejects.toThrow(/alterada em outra sessão/);
  expect((await calendarStatus(f.campus, id)).record).toMatchObject({
    courses: 'Curso corrigido',
    label: 'Proposta A',
  });
  // Saving what is already stored is not a conflict.
  await f.campus.mutation(api.calendars.updateCalendarIdentity, {
    id,
    expected: opened,
    body: await f.stored(id),
  });
});
