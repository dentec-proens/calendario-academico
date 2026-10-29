import { afterEach, expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { inspectCalendar } from '../../src/domain/calendar/base.ts';
import { createEditorSession } from '../../web/features/calendar-editor/session/editor-session.ts';
import {
  applyPeriod,
  applyWeek,
  removePeriod,
} from '../../src/domain/calendar/commands/periods.ts';
import { configureOrganization } from '../../src/domain/calendar/commands/organization.ts';
import type {
  CalendarSave,
  CalendarEvent,
  CalendarRecord,
  CalendarState,
} from '../../web/features/calendar-editor/types.ts';

const savedBase = (record: CalendarRecord) => ({
  revision: record.currentCatalogueRevision,
  events: record.institutionalEvents,
  documents: record.currentDocuments,
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
  const record = await fixture.asClient('admin').mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Curso de teste',
      purpose: 'test',
    },
  });
  return {
    ...record,
    state: {
      ...record.state,
      periods: withPeriod
        ? [
            {
              id: 'session-period',
              name: 'Período base',
              start: '2027-03-01',
              end: '2027-03-26',
              association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
            },
          ]
        : [],
    },
  };
}

test('the server rejects removal of the last period while registered stages still need it', async () => {
  const fixture = await createNativeFixture();
  const client = fixture.asClient('admin');
  const created = await client.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Curso',
      purpose: 'test',
    },
  });
  const saved = await client.mutation(api.calendars.saveCalendar, {
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
            start: '2027-03-01',
            end: '2027-03-26',
            association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
          },
        ],
        assessmentStagesByModality: { integrado: 2 },
        events: [1, 2].map((number): CalendarEvent => ({
          id: `stage-${number}`,
          name: `${number}ª etapa`,
          requirementId: `stage-${number}:integrado`,
          modalities: ['integrado'],
          start: number === 1 ? '2027-03-01' : '2027-03-15',
          end: number === 1 ? '2027-03-12' : '2027-03-26',
          assessmentAutoStart: '2027-03-01',
          kind: 'note' as const,
          category: 'limite',
        })),
      },
    },
  });
  const state = removePeriod(saved.state, 'first', created.institutionalEvents);
  await expect(
    client.mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: { version: saved.version, catalogueRevision: created.currentCatalogueRevision, state },
    }),
  ).rejects.toThrow(/etapa.*período/);
  const intact = await client.query(api.calendars.calendar, { id: created.id });
  expect(intact.state.periods).toEqual(saved.state.periods);
  expect(intact.state.events).toEqual(saved.state.events);
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

test('domain commands reject invalid changes atomically and recalculate teaching-day targets', async () => {
  const record = await opened(false);
  const original = structuredClone(record.state);
  expect(() => applyWeek(record.state, { weekdays: [], weekConfirmed: true }, [])).toThrow();
  expect(record.state).toEqual(original);
  const week = applyWeek(
    configureOrganization(record.state, { integrado: 'anual' }, []),
    { weekdays: [1, 2, 3, 4, 5], weekConfirmed: true },
    [],
  );
  const first = applyPeriod(
    week,
    {
      name: 'Período',
      start: '2027-02-01',
      end: '',
      days: '5',
      association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
    },
    [],
    () => 'period-a',
  );
  expect(first.periods[0].end).toBe('2027-02-05');
  expect(() =>
    applyPeriod(
      first,
      {
        name: 'Sobreposto',
        start: '2027-02-03',
        end: '2027-02-06',
        days: '',
        association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
      },
      [],
      () => 'period-b',
    ),
  ).toThrow('Já existe um período para este ciclo');
  expect(first.periods).toHaveLength(1);
});

test('a new institutional revision is saved only after explicit confirmation, preserving applied edits', async () => {
  const original = await opened();
  const record = { ...original, currentCatalogueRevision: 2 };
  const revisions: number[] = [];
  const session = createEditorSession(record, async (body) => {
    revisions.push(body.catalogueRevision);
    if (body.baseAcceptance !== inspectCalendar(record, record).identity)
      throw Object.assign(new Error('A base institucional mudou.'), { status: 409 });
    return {
      state: body.state,
      version: 2,
      updatedAt: record.updatedAt,
      readiness: record.readiness,
      base: savedBase(record),
    };
  });
  session.apply((state) => editPeriodName(state, 'Decisão local preservada'));
  await expect(session.flush()).rejects.toThrow('base institucional');
  expect(revisions).toEqual([1]);
  await session.confirmBase(session.getSnapshot().baseUpdate.identity);
  expect(revisions).toEqual([1, 1]);
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    record: { catalogueRevision: 2 },
    state: { periods: [{ name: 'Decisão local preservada' }] },
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

test('confirmation keeps the identity shown to the person instead of accepting a more recent publication', async () => {
  const record = await opened();
  const write = vi.fn(async () => {
    throw Error('Não deve gravar');
  });
  const session = createEditorSession(record, write);
  const displayed = session.getSnapshot().baseUpdate.identity;
  session.receive({
    ...record,
    currentCatalogueRevision: 2,
    institutionalEvents: [
      ...record.institutionalEvents,
      {
        id: 'inst:new',
        name: 'Novo feriado',
        start: '2027-04-01',
        end: '2027-04-01',
        kind: 'exclude',
        evidence: 'Portaria',
      },
    ],
  });
  await expect(session.confirmBase(displayed)).rejects.toThrow('novamente');
  expect(write).not.toHaveBeenCalled();
  expect(session.getSnapshot().dirty).toBe(false);
  session.dispose();
});

test.each(['before-failure', 'after-failure'])(
  'a rejected acceptance is discarded and a reverted equivalent base releases autosave (%s)',
  async (timing) => {
    const original = await opened();
    const record = {
      ...original,
      currentCatalogueRevision: 2,
      institutionalEvents: [
        ...original.institutionalEvents,
        {
          id: 'inst:temporary',
          name: 'Evento temporário',
          start: '2027-04-01',
          end: '2027-04-01',
          kind: 'note' as const,
          evidence: 'Portaria',
        },
      ],
    };
    let writes = 0;
    const sent: Array<string | undefined> = [];
    const reverted = { ...original, currentCatalogueRevision: 3 };
    const session = createEditorSession(record, async (body) => {
      sent.push(body.baseAcceptance);
      if (++writes === 1) {
        if (timing === 'before-failure') session.receive(reverted);
        throw Object.assign(Error('A base mudou desde a comparação.'), { status: 409 });
      }
      return {
        state: body.state,
        version: original.version,
        updatedAt: original.updatedAt,
        readiness: original.readiness,
        base: { ...savedBase(original), revision: 3 },
      };
    });
    const accepting = session.confirmBase(session.getSnapshot().baseUpdate.identity);
    if (timing === 'after-failure') {
      await expect(accepting).rejects.toThrow('comparação');
      expect(session.getSnapshot().status).toBe('blocked');
      session.receive(reverted);
      await session.flush();
    } else await accepting;
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBeTruthy();
    expect(sent[1]).toBeUndefined();
    expect(session.getSnapshot()).toMatchObject({
      dirty: false,
      status: 'saved',
      record: { version: original.version, catalogueRevision: 3 },
    });
    session.apply((state) => editPeriodName(state, 'Nova alteração permitida'));
    await session.flush();
    expect(sent.at(-1)).toBeUndefined();
    session.dispose();
  },
);

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
          kind: 'note',
          start: '2027-03-01',
          end: '2027-03-01',
          modalities: ['integrado'],
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
