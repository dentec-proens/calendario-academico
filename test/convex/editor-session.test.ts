import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { afterEach, expect, test, vi } from 'vitest';
import { definedStage } from '../helpers/activity-links.ts';
import { api } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { createEditorSession } from '../../web/features/calendar-editor/session/editor-session.ts';
import { applyWeek } from '../../src/domain/calendar/commands/periods.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import type {
  CalendarSave,
  CalendarEvent,
  CalendarRecord,
  CalendarState,
} from '../../web/features/calendar-editor/types.ts';

const savedBase = (record: CalendarRecord) => ({
  revision: record.currentCatalogueRevision,
  events: record.institutionalEvents,
});

afterEach(() => vi.useRealTimers());

test.each([401, 409])(
  'reauthentication resumes an unauthorized save but preserves a version conflict (%s)',
  async (status) => {
    const record = await opened();
    vi.useFakeTimers();
    const write = vi.fn(async (body: { state: typeof record.state; version: number }) => {
      if (write.mock.calls.length === 1)
        throw Object.assign(new Error('Gravação bloqueada'), { status });
      return {
        state: body.state,
        version: body.version + 1,
        updatedAt: record.updatedAt,
        readiness: record.readiness,
        base: savedBase(record),
      };
    });
    const session = createEditorSession(record, write);
    session.apply((state) => editPeriodName(state, 'Decisão preservada'));
    await expect(session.flush()).rejects.toThrow('Gravação bloqueada');
    session.setAccessSuspended(true);
    session.setAccessSuspended(false);
    if (status === 401) {
      await session.flush();
      expect(write).toHaveBeenCalledTimes(2);
      expect(session.getSnapshot()).toMatchObject({ dirty: false, status: 'saved' });
    } else {
      await expect(session.flush()).rejects.toThrow('Gravação bloqueada');
      expect(write).toHaveBeenCalledOnce();
      expect(session.getSnapshot()).toMatchObject({ dirty: true, status: 'blocked' });
    }
    session.dispose();
  },
);

test('an unauthorized response from an old request can arrive after reauthentication', async () => {
  const record = await opened();
  vi.useFakeTimers();
  let rejectFirst!: (error: Error) => void;
  const write = vi.fn((body: { state: typeof record.state; version: number }) => {
    if (write.mock.calls.length === 1)
      return new Promise<CalendarSave>((_resolve, reject) => {
        rejectFirst = reject;
      });
    return Promise.resolve({
      state: body.state,
      version: body.version + 1,
      updatedAt: record.updatedAt,
      readiness: record.readiness,
      base: savedBase(record),
    });
  });
  const session = createEditorSession(record, write);
  session.apply((state) => editPeriodName(state, 'Dados aplicados antes da expiração'));
  const flushing = session.flush();
  await Promise.resolve();
  session.setAccessSuspended(true);
  session.setAccessSuspended(false);
  rejectFirst(
    Object.assign(new Error('Credenciais da gravação anterior expiraram'), { status: 401 }),
  );
  await flushing;
  expect(write).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    status: 'saved',
    state: { periods: [{ name: 'Dados aplicados antes da expiração' }] },
  });
  session.dispose();
});

test('expired access pauses scheduled writes without losing applied state and resumes safely', async () => {
  const record = await opened();
  vi.useFakeTimers();
  const write = vi.fn(async (body: { state: typeof record.state; version: number }) => ({
    state: body.state,
    version: body.version + 1,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: savedBase(record),
  }));
  const session = createEditorSession(record, write);
  session.apply((state) => editPeriodName(state, 'Decisão preservada'));
  session.setAccessSuspended(true);
  await vi.runAllTimersAsync();
  expect(write).not.toHaveBeenCalled();
  await expect(session.flush()).rejects.toThrow('Entre novamente');
  expect(() => session.apply((state) => state)).toThrow('Entre novamente');
  expect(session.getSnapshot().state.periods[0].name).toBe('Decisão preservada');
  session.setAccessSuspended(false);
  await session.flush();
  expect(write).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    state: { periods: [{ name: 'Decisão preservada' }] },
  });
  session.dispose();
});

function editPeriodName<S extends CalendarState>(state: S, name: string): S {
  return {
    ...state,
    periods: state.periods.map((period, index) => (index ? period : { ...period, name })),
  };
}

async function opened(withPeriod = true): Promise<CalendarRecord> {
  const fixture = await createNativeFixture();
  const record = await fixture
    .asClient('admin')
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  return {
    ...record,
    state: {
      ...record.state,
      periods: withPeriod
        ? [
            {
              id: 'session-period',
              name: 'Período base',
              start: civilDate('2027-03-01'),
              end: civilDate('2027-03-26'),
              association: { status: 'defined', offers: ['integrado'], term: 'annual' },
            },
          ]
        : [],
    },
  };
}

test('removing the last period is saved and leaves the unchanged stages to review, out of their cycle', async () => {
  const fixture = await createNativeFixture();
  const client = fixture.asClient('admin');
  const created = await client
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  const saved = await client
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: created.version,
        catalogueRevision: created.currentCatalogueRevision,
        state: {
          ...created.state,
          weekConfirmed: true,
          weekdays: [1, 2, 3, 4, 5],
          periods: [
            {
              id: 'first',
              name: 'Primeiro período',
              start: civilDate('2027-03-01'),
              end: civilDate('2027-03-26'),
              association: { status: 'defined', offers: ['integrado'], term: 'annual' },
            },
          ],
          offers: created.state.offers.map((offer) => ({
            ...offer,
            stages: { status: 'defined' as const, perTerm: 2 as const },
          })),
          events: [1, 2].map((number): CalendarEvent => ({
            id: `stage-${number}`,
            name: `${number}ª etapa`,
            activity: definedStage('stage', 'integrado', 'annual', number),
            offers: ['integrado'],
            start: civilDate(number === 1 ? '2027-03-01' : '2027-03-15'),
            end: civilDate(number === 1 ? '2027-03-12' : '2027-03-26'),
            assessmentAutoStart: civilDate('2027-03-01'),
            effect: 'note' as const,
            category: 'limite',
          })),
        },
      },
    })
    .then(calendarSaveDates);
  const state = { ...saved.state, periods: [] };
  const removed = await client
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: saved.version,
        catalogueRevision: created.currentCatalogueRevision,
        state,
      },
    })
    .then(calendarSaveDates);
  expect(removed.state.periods).toEqual([]);
  expect(removed.state.events.map(({ id, activity }) => ({ id, activity }))).toEqual(
    saved.state.events.map(({ id, activity }) => ({ id, activity })),
  );
  expect([...linksToReview({ ...removed.state, year: 2027 })]).toEqual([
    ['stage-1', 'out-of-cycle'],
    ['stage-2', 'out-of-cycle'],
  ]);
  // Moving a stage is an edit: it must fit the cycle that no longer has a period.
  await expect(
    client.mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: removed.version,
        catalogueRevision: created.currentCatalogueRevision,
        state: {
          ...removed.state,
          events: removed.state.events.map((event) =>
            event.id === 'stage-2' ? { ...event, end: civilDate('2027-03-25') } : event,
          ),
        },
      },
    }),
  ).rejects.toThrow(/etapa.*período/);
});

test('a command that changes nothing leaves an unstamped calendar with nothing to save', async () => {
  const record = await opened();
  delete record.state.rulesetVersion;
  const write = vi.fn();
  const session = createEditorSession(record, write);
  session.apply((state) => state);
  expect(session.getSnapshot().dirty).toBe(false);
  await session.flush();
  expect(write).not.toHaveBeenCalled();
});

test('each refused write is reported once', async () => {
  const record = await opened();
  vi.useFakeTimers();
  const refused = Object.assign(new Error('Há versão mais recente.'), { status: 409 });
  const failures: unknown[] = [];
  const write = vi.fn().mockRejectedValueOnce(refused);
  const session = createEditorSession(
    record,
    write,
    false,
    () => true,
    (error) => failures.push(error),
  );
  session.apply((state) => editPeriodName(state, 'Primeira'));
  await expect(session.flush()).rejects.toThrow('versão mais recente');
  expect(session.getSnapshot()).toMatchObject({
    status: 'blocked',
    error: 'Há versão mais recente.',
  });
  // Trying to save while blocked sends nothing, so it reports nothing new.
  await session.retry();
  expect(failures).toEqual([refused]);
});

test('an expired session says what to do', async () => {
  const record = await opened();
  vi.useFakeTimers();
  const expired = Object.assign(new Error('Entre com sua conta.'), { status: 401 });
  const session = createEditorSession(record, vi.fn().mockRejectedValue(expired));
  session.apply((state) => editPeriodName(state, 'Primeira'));
  await expect(session.flush()).rejects.toThrow('Entre com sua conta');
  expect(session.getSnapshot().error).toContain('Sua sessão expirou');
});

test('flush drains edits applied during a write and advances the expected version', async () => {
  const record = await opened();
  const sent: { version: number; name: string }[] = [];
  let finish!: (value: CalendarSave) => void;
  const session = createEditorSession(record, (body) => {
    sent.push({ version: body.version, name: body.state.periods[0].name });
    const value = {
      version: body.version + 1,
      state: body.state,
      updatedAt: record.updatedAt,
      readiness: record.readiness,
      base: savedBase(record),
    };
    return sent.length === 1
      ? new Promise<CalendarSave>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(value);
  });
  session.apply((state) => editPeriodName(state, 'Primeira decisão'));
  const flushing = session.flush();
  await Promise.resolve();
  const first = session.getSnapshot().state;
  session.apply((state) => editPeriodName(state, 'Decisão aplicada durante a gravação'));
  finish({
    version: 2,
    state: first,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: savedBase(record),
  });
  await flushing;
  expect(sent).toEqual([
    { version: 1, name: 'Primeira decisão' },
    { version: 2, name: 'Decisão aplicada durante a gravação' },
  ]);
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    status: 'saved',
    record: { version: 3 },
    state: { periods: [{ name: 'Decisão aplicada durante a gravação' }] },
  });
  session.dispose();
});

test('remote updates cannot overwrite unapplied fields or dirty state', async () => {
  const record = await opened();
  const session = createEditorSession(record, async () => {
    throw new Error('unexpected write');
  });
  session.setFormDirty('event', true);
  const remote = {
    ...record,
    version: record.version + 1,
    state: editPeriodName(record.state, 'Outra sessão'),
  };
  session.receive(remote);
  expect(session.getSnapshot().record.version).toBe(record.version);
  expect(session.getSnapshot().state.periods[0].name).toBe(record.state.periods[0].name);
  expect(session.getSnapshot().remote?.version).toBe(remote.version);
  session.dispose();
});

test('a save confirmation keeps the identity received from the subscription meanwhile', async () => {
  const record = await opened();
  let finish!: (value: CalendarSave) => void;
  const session = createEditorSession(
    record,
    () =>
      new Promise<CalendarSave>((resolve) => {
        finish = resolve;
      }),
  );
  session.apply((state) => editPeriodName(state, 'Decisão em gravação'));
  const flushing = session.flush();
  await Promise.resolve();
  const sent = session.getSnapshot().state;
  // The identity changed while the save was in flight: the snapshot carries the saved content.
  session.receive({
    ...record,
    version: record.version + 1,
    state: sent,
    courses: 'Técnico em Informática',
    label: 'Proposta A',
    name: `${record.name} — Proposta A`,
  });
  expect(session.getSnapshot().remote).not.toBeNull();
  finish({
    version: record.version + 1,
    state: sent,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: savedBase(record),
  });
  await flushing;
  expect(session.getSnapshot().remote).toBeNull();
  expect(session.getSnapshot().record).toMatchObject({
    version: record.version + 1,
    courses: 'Técnico em Informática',
    label: 'Proposta A',
    name: `${record.name} — Proposta A`,
  });
  session.dispose();
});

test('disposed sessions ignore late save confirmations and cancel scheduled writes', async () => {
  const record = await opened();
  vi.useFakeTimers();
  let finish!: (value: CalendarSave) => void;
  const write = vi.fn(
    () =>
      new Promise<CalendarSave>((resolve) => {
        finish = resolve;
      }),
  );
  const session = createEditorSession(record, write);
  session.apply((state) => editPeriodName(state, 'Decisão'));
  const flushing = session.flush();
  await Promise.resolve();
  const before = session.getSnapshot();
  session.dispose();
  finish({
    state: before.state,
    version: 2,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: savedBase(record),
  });
  await expect(flushing).rejects.toThrow('encerrada');
  await vi.runAllTimersAsync();
  expect(write).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot()).toBe(before);
});

test('read-only sessions reject domain commands and never persist', async () => {
  const record = await opened();
  const write = vi.fn();
  const session = createEditorSession(record, write, true);
  expect(() => session.apply((state) => state)).toThrow('somente leitura');
  await session.retry();
  await session.flush();
  expect(write).not.toHaveBeenCalled();
  session.dispose();
});

test('the week command rejects invalid changes atomically', async () => {
  const record = await opened(false);
  const original = structuredClone(record.state);
  expect(() => applyWeek(record.state, { weekdays: [], weekConfirmed: true })).toThrow();
  expect(record.state).toEqual(original);
  const week = applyWeek(record.state, { weekdays: [1, 2, 3, 4, 5], weekConfirmed: true });
  expect(week.weekdays).toEqual([1, 2, 3, 4, 5]);
  expect(record.state).toEqual(original);
});

const newEvent = {
  id: 'inst:new',
  name: 'Novo evento',
  start: civilDate('2027-03-09'),
  end: civilDate('2027-03-09'),
  effect: 'exclude',
  category: 'feriado',
  evidence: 'Portaria',
  offers: ['integrado'],
  institutional: true,
} as CalendarRecord['institutionalEvents'][number];

test('a new catalogue reaches an editor with local edits without becoming a conflict', async () => {
  const record = await opened();
  vi.useFakeTimers();
  const session = createEditorSession(record, vi.fn());
  session.apply((state) => editPeriodName(state, 'Decisão local preservada'));
  session.receive({
    ...record,
    currentCatalogueRevision: record.currentCatalogueRevision + 1,
    institutionalEvents: [...record.institutionalEvents, newEvent],
  });
  expect(session.getSnapshot()).toMatchObject({
    remote: null,
    dirty: true,
    state: { periods: [{ name: 'Decisão local preservada' }] },
    record: { currentCatalogueRevision: record.currentCatalogueRevision + 1 },
  });
  expect(session.getSnapshot().baseUpdate.events.added.map(({ id }) => id)).toEqual(['inst:new']);
  session.dispose();
});

test('a save with nothing to record leaves the stored copy where it was', async () => {
  const record = await opened();
  const live = [newEvent];
  const session = createEditorSession({ ...record, institutionalEvents: live }, async (body) => ({
    state: body.state,
    version: record.version,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    unchanged: true,
    base: { ...savedBase(record), events: live },
  }));
  session.apply((state) => editPeriodName(state, 'Outra'));
  await session.flush();
  expect(session.getSnapshot().record.institutionalSnapshot).toEqual(record.institutionalSnapshot);
  session.dispose();
});

test('a base that only arrived with the last save was not seen, so the submission waits', async () => {
  const record = await opened();
  vi.useFakeTimers();
  const session = createEditorSession(record, async (body) => ({
    state: body.state,
    version: record.version + 1,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: {
      ...savedBase(record),
      revision: record.currentCatalogueRevision + 1,
      events: [newEvent],
    },
  }));
  session.apply((state) => editPeriodName(state, 'Última edição'));
  await expect(session.prepareSubmission()).rejects.toThrow('Confira o calendário');
  await expect(session.prepareSubmission()).resolves.toMatchObject({
    version: record.version + 1,
    baseIdentity: session.getSnapshot().baseUpdate.identity,
  });
  session.dispose();
});

test('a delayed equivalence synchronization cannot hide a newer calendar conflict or base change', async () => {
  const record = await opened();
  const session = createEditorSession(record, async () => {
    throw Error('Não deve gravar');
  });
  session.setFormDirty('draft', true);
  const remote = { ...record, version: record.version + 1, currentCatalogueRevision: 3 };
  session.receive(remote);
  session.receive({ ...record, catalogueRevision: 2, currentCatalogueRevision: 2 });
  expect(session.getSnapshot().remote).toEqual(remote);
  expect(session.getSnapshot().unapplied).toBe(true);
  session.receive({ ...remote, catalogueRevision: 2, currentCatalogueRevision: 2 });
  expect(session.getSnapshot().remote).toEqual(remote);
  session.dispose();
});

test('explicitly reopening remote data preserves the active session and accepts later confirmed saves', async () => {
  const record = await opened();
  vi.useFakeTimers();
  const write = vi.fn(async (body: { state: typeof record.state; version: number }) => ({
    state: body.state,
    version: body.version + 1,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: savedBase(record),
  }));
  const session = createEditorSession(record, write);
  session.apply((state) => editPeriodName(state, 'Aplicado localmente'));
  session.setFormDirty('pending-field', true);
  const remote = {
    ...record,
    version: record.version + 1,
    state: editPeriodName(record.state, 'Decisão remota'),
  };
  session.receive(remote);
  expect(session.getSnapshot().remote).not.toBeNull();
  session.reopenRemote();
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    unapplied: false,
    remote: null,
    status: 'idle',
    formEpoch: 1,
    state: { periods: [{ name: 'Decisão remota' }] },
  });
  session.apply((state) => editPeriodName(state, 'Nova decisão local'));
  await session.flush();
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ version: remote.version }));
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    state: { periods: [{ name: 'Nova decisão local' }] },
  });
  session.dispose();
});

test('canonical state keeps manual sources absent on opening, save acknowledgement and remote reception', async () => {
  const record = await opened();
  const canonical: CalendarRecord = {
    ...record,
    state: {
      ...record.state,
      events: [
        {
          id: 'local',
          name: 'Evento',
          effect: 'note',
          start: civilDate('2027-03-01'),
          end: civilDate('2027-03-01'),
          offers: ['integrado'],
        },
      ],
    },
  };
  const session = createEditorSession(canonical, async (body) => ({
    state: {
      ...body.state,
      events: body.state.events,
    },
    version: body.version + 1,
    updatedAt: record.updatedAt,
    readiness: record.readiness,
    base: savedBase(record),
  }));
  expect(session.getSnapshot().dirty).toBe(false);
  expect(session.getSnapshot().state).not.toHaveProperty('weekEvidence');
  expect(session.getSnapshot().record.state.events[0]).not.toHaveProperty('evidence');
  expect(session.getSnapshot().record.institutionalSnapshot).toEqual(record.institutionalSnapshot);
  session.apply((state) => editPeriodName(state, 'Período ajustado'));
  await session.flush();
  expect(session.getSnapshot().dirty).toBe(false);
  expect(session.getSnapshot().state).not.toHaveProperty('weekEvidence');
  expect(session.getSnapshot().record.state.events[0]).not.toHaveProperty('evidence');
  const confirmed = session.getSnapshot().record;
  session.receive({
    ...confirmed,
    state: editPeriodName(confirmed.state, 'Alteração remota'),
  });
  expect(session.getSnapshot().dirty).toBe(false);
  expect(session.getSnapshot().record.state).not.toHaveProperty('weekEvidence');
  session.dispose();
});
