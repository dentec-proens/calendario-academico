import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useQuery, useConvexConnectionState } from 'convex/react';
import { useBlocker } from '@tanstack/react-router';
import type { Id } from '../../../../convex/_generated/dataModel.js';
import { functions } from '../../../shared/convex/client.ts';
import { calendars } from '../../../shared/convex/calendars.ts';
import { sessionIdentity, useAppSession } from '../../../app/session.tsx';
import { confirmAction } from '../../../components/confirmation.ts';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { campusInstitutionalEvents } from '../../../../src/teacher-day.ts';
import { evaluateCalendar } from '../../../../src/evaluation.ts';
import { createEditorSession } from './editor-session.ts';
import type { CalendarRecord, CalendarState, EditorEvent } from '../types.ts';
import { saveBlob } from '../../../shared/convex/files.ts';

const AccessPage = lazy(() => import('../../access/AccessPage.tsx'));

function useSession(record: CalendarRecord) {
  const { info, status, notify, registerEditor, editorRecovery } = useAppSession();
  const drafts = useFormDrafts();
  const readOnly = info.user.role === 'PARECERISTA';
  const [session] = useState(() =>
    createEditorSession(record, (body) => calendars.save(record.id, body), readOnly),
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const connection = useConvexConnectionState();
  const suspended = Boolean(editorRecovery);
  useEffect(() => {
    session.setAccessSuspended(suspended);
  }, [session, suspended]);
  useEffect(() => {
    session.receive(record);
  }, [record, session]);
  const synchronization = useRef('');
  useEffect(() => {
    if (
      readOnly ||
      !connection.isWebSocketConnected ||
      suspended ||
      snapshot.baseUpdate.kind !== 'equivalent'
    )
      return;
    const key = `${snapshot.record.version}:${snapshot.remote?.currentCatalogueRevision ?? snapshot.record.currentCatalogueRevision}`;
    if (synchronization.current === key) return;
    synchronization.current = key;
    void calendars
      .synchronizeBase(record.id, snapshot.record.version)
      .then((fresh) => session.receive(fresh))
      .catch(() => {
        synchronization.current = '';
      });
  }, [
    record.id,
    snapshot.baseUpdate.kind,
    snapshot.record.version,
    snapshot.record.currentCatalogueRevision,
    snapshot.remote?.currentCatalogueRevision,
    readOnly,
    suspended,
    connection.isWebSocketConnected,
    session,
  ]);
  const previousEvents = useRef(new Set(record.state.events.map((event) => event.id)));
  useEffect(() => {
    const present = new Set(snapshot.state.events.map((event) => event.id));
    for (const id of previousEvents.current) {
      if (present.has(id)) continue;
      for (const formId of [`event-metadata:${id}`, `saturday-edit:${id}`]) {
        session.setFormDirty(formId, false);
        drafts?.clear(`calendar:${record.id}:${formId}`);
      }
    }
    previousEvents.current = present;
  }, [drafts, record.id, session, snapshot.state.events]);
  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = session.getSnapshot();
      if (state.dirty || state.unapplied || state.status === 'saving') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [session]);
  const confirmLeavingEditor = useCallback(async () => {
    if (suspended) return false;
    const value = session.getSnapshot();
    if (!value.dirty && !value.unapplied && value.status !== 'saving') return true;
    return confirmAction({
      title: 'Sair deste calendário?',
      description: 'As alterações aplicadas serão salvas antes de sair.',
      consequence: value.unapplied
        ? 'Os campos ainda não aplicados serão descartados. Cancele para conferir o preenchimento.'
        : undefined,
      confirmLabel: 'Salvar e sair',
      pendingLabel: 'Salvando…',
      onConfirm: async () => {
        await session.flush();
        drafts?.clearScope(`calendar:${record.id}:`);
      },
    });
  }, [drafts, record.id, session, suspended]);
  useEffect(
    () =>
      registerEditor?.({
        calendarId: record.id,
        info,
        status,
        beforeLogout: confirmLeavingEditor,
      }),
    [confirmLeavingEditor, info, record.id, registerEditor, status],
  );
  useBlocker({
    shouldBlockFn: async ({ current, next }) => {
      const currentCalendar = current.pathname.split('/')[2];
      const nextCalendar = next.pathname.startsWith('/calendarios/')
        ? next.pathname.split('/')[2]
        : '';
      if (currentCalendar === nextCalendar) return false;
      return !(await confirmLeavingEditor());
    },
    enableBeforeUnload: false,
  });
  const institutional = useMemo(
    () =>
      campusInstitutionalEvents(
        snapshot.baseUpdate.compatible
          ? snapshot.record.institutionalEvents
          : snapshot.record.institutionalSnapshot,
        snapshot.state,
      ),
    [
      snapshot.baseUpdate.compatible,
      snapshot.record.institutionalEvents,
      snapshot.record.institutionalSnapshot,
      snapshot.state,
    ],
  );
  const events = useMemo<EditorEvent[]>(
    () => [...institutional, ...snapshot.state.events],
    [institutional, snapshot.state.events],
  );
  const evaluation = useMemo(() => {
    if (!snapshot.state.weekConfirmed || !snapshot.state.periods.length) return null;
    try {
      return evaluateCalendar(snapshot.state, events);
    } catch {
      return null;
    }
  }, [snapshot.state, events]);
  function applyCommand(command: (state: CalendarState) => CalendarState) {
    try {
      session.apply(command);
      return true;
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : 'Não foi possível aplicar a alteração.',
        true,
      );
      return false;
    }
  }
  return {
    ...snapshot,
    session,
    institutional,
    events,
    evaluation,
    readOnly: readOnly || suspended,
    isAdmin: info.user.role === 'ADMIN',
    connected: connection.isWebSocketConnected,
    notify,
    applyCommand,
  };
}

type Context = ReturnType<typeof useSession>;
const EditorContext = createContext<Context | null>(null);

function OpenEditor({ record, children }: PropsWithChildren<{ record: CalendarRecord }>) {
  const controller = useSession(record);
  const { editorRecovery } = useAppSession();
  return (
    <EditorContext.Provider value={controller}>
      {editorRecovery && <ExpiredEditorRecovery />}
      <div inert={Boolean(editorRecovery)} hidden={editorRecovery?.checkingIdentity || undefined}>
        {children}
      </div>
    </EditorContext.Provider>
  );
}

function ExpiredEditorRecovery() {
  const { editorRecovery, notify } = useAppSession();
  const { session, record } = useCalendarEditor();
  const drafts = useFormDrafts();
  const [login, setLogin] = useState(false);
  if (!editorRecovery) return null;
  return (
    <section className="panel" id="editor-session-expired" aria-labelledby="expired-session-title">
      <h2 id="expired-session-title">Sessão de acesso interrompida</h2>
      <p>
        O calendário permanece nesta aba, com a edição bloqueada. Baixe uma cópia dos dados
        aplicados ou entre novamente com a mesma conta para continuar. Campos ainda não aplicados
        permanecem nesta aba.
      </p>
      <div className="actions">
        <button
          type="button"
          id="expired-editor-copy"
          disabled={editorRecovery.checkingIdentity}
          onClick={() => {
            const applied = session.getSnapshot().state;
            saveBlob(
              new Blob([JSON.stringify(applied, null, 2)], { type: 'application/json' }),
              `rascunho-calendario-${applied.year}.json`,
            );
            notify('Download solicitado. Somente dados aplicados foram incluídos.');
          }}
        >
          Baixar cópia aplicada
        </button>
        <button type="button" id="expired-editor-login" onClick={() => setLogin(true)}>
          Entrar novamente
        </button>
        <button
          type="button"
          id="expired-editor-discard"
          className="secondary"
          onClick={() => {
            void confirmAction({
              title: 'Descartar calendário desta aba?',
              description:
                'Baixe uma cópia antes de descartar se precisar guardar os dados aplicados.',
              consequence:
                'Alterações sem confirmação de salvamento e campos ainda não aplicados serão descartados.',
              confirmLabel: 'Descartar e ir para acesso',
              intent: 'danger',
              onConfirm: () => {
                session.abandon();
                drafts?.clearScope(`calendar:${record.id}:`);
                editorRecovery.discard();
                return Promise.resolve();
              },
            });
          }}
        >
          Descartar e ir para acesso
        </button>
      </div>
      {login && (
        <Suspense fallback={<p role="status">Carregando acesso…</p>}>
          <AccessPage />
        </Suspense>
      )}
    </section>
  );
}

export function CalendarEditorProvider({
  calendarId,
  children,
}: PropsWithChildren<{ calendarId: string }>) {
  const { user, editorRecovery } = useAppSession();
  const fresh = useQuery(
    functions.calendars.calendar,
    editorRecovery ? 'skip' : { id: calendarId as Id<'calendars'> },
  );
  const [retained, setRetained] = useState(fresh);
  if (fresh && retained !== fresh) setRetained(fresh);
  const record = fresh ?? (editorRecovery?.calendarId === calendarId ? retained : null);
  if (!record) return <p role="status">Carregando calendário…</p>;
  return (
    <OpenEditor key={`${calendarId}:${sessionIdentity(user)}`} record={record}>
      {children}
    </OpenEditor>
  );
}

export function useCalendarEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('Abra um calendário para continuar.');
  return context;
}
