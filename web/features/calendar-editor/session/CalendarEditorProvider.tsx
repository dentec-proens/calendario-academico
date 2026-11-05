import { calendarRecordDates } from '../../../shared/convex/calendar-dates.ts';
import { LoadingIndicator } from '../../../components/ui/LoadingIndicator.tsx';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
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
import { applyObservances } from '#src/domain/calendar/observances.ts';
import { evaluateCalendar } from '#src/domain/calendar/counting/evaluation.ts';
import { projectDates } from '#src/domain/calendar/model.ts';
import { createEditorSession } from './editor-session.ts';
import { reportClientError } from '../../../shared/convex/report-error.ts';
import type { CalendarRecord, CalendarState, EditorEvent } from '../types.ts';
import EditorAccessNotice from './EditorAccessNotice.tsx';
import { isEditable } from '#src/domain/calendar/lifecycle.ts';

function useSession(record: CalendarRecord) {
  const { info, status, notify, registerEditor, editorRecovery, maintenance } = useAppSession();
  const drafts = useFormDrafts();
  // A locked calendar is read-only for everyone: autosave, flush and base sync never write to it.
  const locked = !isEditable(record.status);
  const readOnly = info.user.role === 'PARECERISTA' || locked;
  const [session] = useState(() =>
    createEditorSession(
      record,
      (body) => calendars.save(record.id, body),
      readOnly,
      () => !drafts?.protection.locked,
      (error) => reportClientError('save', error, record.id),
    ),
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const connection = useConvexConnectionState();
  const suspended = Boolean(editorRecovery || maintenance);
  useEffect(() => {
    session.setAccessSuspended(suspended);
  }, [session, suspended]);
  useEffect(() => {
    session.receive(record);
  }, [record, session]);
  const previousEvents = useRef(new Set(record.state.events.map((event) => event.id)));
  useEffect(() => {
    const present = new Set(snapshot.state.events.map((event) => event.id));
    for (const id of previousEvents.current) {
      if (present.has(id)) continue;
      for (const formId of [`event:${id}`, `event-metadata:${id}`, `saturday-edit:${id}`]) {
        session.setFormDirty(formId, false);
        drafts?.clear(`calendar:${record.id}:${formId}`);
      }
    }
    previousEvents.current = present;
  }, [drafts, record.id, session, snapshot.state.events]);
  useEffect(() => () => session.dispose(), [session]);
  useLayoutEffect(() => {
    if (!drafts) return;
    const unregister = drafts.protection.register(() => {
      const value = session.getSnapshot();
      return value.dirty ||
        value.unapplied ||
        !['idle', 'saved'].includes(value.status) ||
        value.error ||
        value.remote
        ? { kind: 'editor', loss: value.dirty || value.unapplied || value.status === 'saving' }
        : null;
    });
    const unsubscribe = session.subscribe(drafts.protection.publish);
    return () => {
      unregister();
      unsubscribe();
    };
  }, [drafts, session]);
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
  // A calendar in editing follows the current base; a locked one reads the copy it was submitted with.
  const baseEvents = locked
    ? snapshot.record.institutionalSnapshot
    : snapshot.record.institutionalEvents;
  const institutional = useMemo(
    () => applyObservances(baseEvents, snapshot.state),
    [baseEvents, snapshot.state],
  );
  const events = useMemo<EditorEvent[]>(
    () => projectDates(institutional, snapshot.state.events),
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
      if (drafts?.protection.locked) return false;
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
    baseEvents,
    institutional,
    events,
    evaluation,
    readOnly: readOnly || suspended,
    locked,
    role: info.user.role,
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
  const { editorRecovery, maintenance } = useAppSession();
  const paused = Boolean(editorRecovery || maintenance);
  return (
    <EditorContext.Provider value={controller}>
      {paused && <EditorAccessNotice />}
      <div inert={paused} hidden={editorRecovery?.checkingIdentity || undefined}>
        {children}
      </div>
    </EditorContext.Provider>
  );
}

export function CalendarEditorProvider({
  calendarId,
  children,
}: PropsWithChildren<{ calendarId: string }>) {
  const { user, editorRecovery } = useAppSession();
  const wireRecord = useQuery(
    functions.calendars.calendar,
    editorRecovery ? 'skip' : { id: calendarId as Id<'calendars'> },
  );
  const fresh = useMemo(
    () => (wireRecord ? calendarRecordDates(wireRecord) : wireRecord),
    [wireRecord],
  );
  const [retained, setRetained] = useState(fresh);
  if (fresh && retained !== fresh) setRetained(fresh);
  const record = fresh ?? (editorRecovery?.calendarId === calendarId ? retained : null);
  if (!record) return <LoadingIndicator label="Carregando calendário…" />;
  return (
    // A status change, here or in another tab, opens a new session with the right access.
    <OpenEditor key={`${calendarId}:${sessionIdentity(user)}:${record.status}`} record={record}>
      {children}
    </OpenEditor>
  );
}

export function useCalendarEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('Abra um calendário para continuar.');
  return context;
}
