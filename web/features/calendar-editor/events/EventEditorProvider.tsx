import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import {
  activityDraft,
  emptyEvent,
  eventFromValues,
  eventValues,
  type EventContext,
  type EventValues,
} from './event-draft.ts';
import { applyEvent } from '#src/domain/calendar/commands/events.ts';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { stageRequirement } from '#src/domain/calendar/activities/assessment.ts';
import { rulesetVersion } from '#src/domain/policies/registry.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { editorPages } from '../editor-steps.ts';

function destination(context: EventContext | null, requirementId: string) {
  const activity = context?.kind === 'activity' ? context.requirementId : requirementId;
  return {
    to: stageRequirement(activity) ? editorPages.periods.path : editorPages.events.path,
    hash: stageRequirement(activity) ? 'assessment-area' : '',
  };
}

function useController() {
  const { state, institutional, session, record, notify, readOnly, formEpoch } =
    useCalendarEditor();
  const navigate = useNavigate();
  const calendarOfferIds = useMemo(() => state.offers.map((offer) => offer.id), [state.offers]);
  const [context, setContext] = useState<EventContext | null>(null);
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [linkUnlocked, setLinkUnlocked] = useState(false);
  // What the side panel shows besides the form: an activity to consult or the Teacher Day.
  const [panel, setPanel] = useState<
    | { kind: 'activity'; requirementId: string }
    | { kind: 'event'; eventId: string }
    | { kind: 'teacher-day' }
    | null
  >(null);
  const opener = useRef<HTMLElement | null>(null);
  const [returnFocus, setReturnFocus] = useState<
    'resume-event' | 'new-event' | 'pending-event-title' | 'editor-section-title' | null
  >(null);
  // The action that opened the panel receives focus when it closes; actions inside it do not.
  const rememberOpener = useCallback(() => {
    // A new action supersedes a focus return queued by the previously closed panel.
    setReturnFocus(null);
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('#event-panel')) opener.current = active;
  }, []);
  const view = useCallback(
    (requirementId: string) => {
      rememberOpener();
      setPanel({ kind: 'activity', requirementId });
    },
    [rememberOpener],
  );
  const result = useCalendarForm(
    'event',
    emptyEvent(calendarOfferIds),
    function apply(value) {
      const id = eventId || crypto.randomUUID();
      session.apply((current) =>
        applyEvent(
          { ...current, rulesetVersion: rulesetVersion(current) },
          eventFromValues(value, {
            id,
            base: current.events.find((event) => event.id === eventId),
          }),
          institutional,
          Boolean(eventId),
        ),
      );
      setEventId(id);
      setContext(
        context?.kind === 'activity' ? { ...context, eventId: id } : { kind: 'event', eventId: id },
      );
    },
    {
      successMessage: (value) =>
        `Evento “${value.name}” aplicado. Confira o indicador de salvamento.`,
    },
  );
  const dirty = result.dirty;
  const { form: eventForm, clearDraft } = result;
  const previousEpoch = useRef(formEpoch);
  useEffect(() => {
    if (previousEpoch.current === formEpoch) return;
    previousEpoch.current = formEpoch;
    setContext(null);
    setOpen(false);
    setEventId(null);
    setLinkUnlocked(false);
    setPanel(null);
    eventForm.reset(emptyEvent(calendarOfferIds));
    clearDraft();
    session.setFormDirty('event', false);
  }, [formEpoch, eventForm, clearDraft, session, calendarOfferIds]);
  useEffect(() => {
    if (!returnFocus) return;
    const frame = requestAnimationFrame(() => {
      const target =
        returnFocus !== 'pending-event-title' &&
        opener.current?.isConnected &&
        opener.current.getClientRects().length
          ? opener.current
          : (document.getElementById(returnFocus) ??
            document.getElementById('editor-section-title'));
      const active = document.activeElement;
      // A person may already have moved to another action after the dialog closed.
      // Do not send the next keyboard activation back to the previous event row.
      if (
        returnFocus !== 'pending-event-title' &&
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== target &&
        !active.closest('#event-panel')
      ) {
        setReturnFocus(null);
        return;
      }
      // A pause gives focus to the access notice; the editor behind it is inert.
      if (!target?.closest('[inert]')) {
        target?.focus({ preventScroll: true });
        scrollIntoView(target, { block: 'start' });
      }
      setReturnFocus(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [returnFocus]);
  const previousVersion = useRef(record.version);
  useEffect(() => {
    if (previousVersion.current === record.version) return;
    previousVersion.current = record.version;
    if (!eventId || dirty) return;
    const event = state.events.find((item) => item.id === eventId);
    if (event) result.form.reset(eventValues(event, calendarOfferIds));
  }, [dirty, eventId, record.version, result.form, state.events, calendarOfferIds]);
  useEffect(() => {
    if (!context) session.setFormDirty('event', false);
  }, [context, session]);

  function canOpen(next: EventContext) {
    if (readOnly || result.pending) return false;
    if (context && JSON.stringify(context) === JSON.stringify(next)) {
      setOpen(true);
      return false;
    }
    if (context && dirty) {
      notify(
        'Há um preenchimento em andamento. Retome-o ou use Descartar alterações antes de abrir outro evento.',
        true,
      );
      return false;
    }
    return true;
  }
  function begin(next: EventContext, values: EventValues, id: string | null = null) {
    const same = context && JSON.stringify(context) === JSON.stringify(next);
    if (!canOpen(next) && !same) return;
    if (readOnly) return;
    if (!same) rememberOpener();
    void navigate({
      ...destination(next, values.requirementId),
      params: { calendarId: record.id },
      search: (previous) => previous,
      hashScrollIntoView: false,
    });
    if (same) return;
    result.form.reset(values);
    setContext(next);
    setEventId(id);
    setLinkUnlocked(false);
    setPanel(
      next.kind === 'activity' ? { kind: 'activity', requirementId: next.requirementId } : null,
    );
    setOpen(true);
    return true;
  }
  function openOrganization(requirementId: string) {
    setOpen(false);
    setPanel(null);
    void navigate({
      to: editorPages.periods.path,
      params: { calendarId: record.id },
      search: (previous) => ({ ...previous, atividade: requirementId }),
      hashScrollIntoView: false,
    });
  }
  function edit(id: string) {
    const event = state.events.find((item) => item.id === id);
    if (!event) return;
    if (stageRequirement(event.requirementId)) {
      openOrganization(event.requirementId!);
      return;
    }
    if (id.startsWith('teacher-vacation-')) {
      void navigate({ to: '/calendarios/$calendarId/ferias', params: { calendarId: record.id } });
      return;
    }
    const next: EventContext = event.requirementId
      ? { kind: 'activity', requirementId: event.requirementId, eventId: id }
      : { kind: 'event', eventId: id };
    begin(next, eventValues(event, calendarOfferIds), id);
  }
  function prepare(requirementId: string) {
    if (stageRequirement(requirementId)) {
      openOrganization(requirementId);
      return;
    }
    const requirement = activityChecklist(state).find((item) => item.id === requirementId);
    if (!requirement) return;
    begin({ kind: 'activity', requirementId }, activityDraft(state, requirement));
  }
  function discard() {
    if (result.pending) return;
    result.form.reset(emptyEvent(calendarOfferIds));
    result.clearDraft();
    session.setFormDirty('event', false);
    setContext(null);
    setOpen(false);
    setEventId(null);
    setLinkUnlocked(false);
    setPanel(null);
    setReturnFocus('new-event');
  }
  async function resume() {
    await navigate({
      ...destination(context, result.form.state.values.requirementId),
      params: { calendarId: record.id },
      search: (previous) => previous,
      hashScrollIntoView: false,
    });
    setPanel(
      context?.kind === 'activity'
        ? { kind: 'activity', requirementId: context.requirementId }
        : null,
    );
    setOpen(true);
    requestAnimationFrame(() => {
      const heading = document.getElementById('event-form-title');
      heading?.focus({ preventScroll: true });
      scrollIntoView(heading, { block: 'start' });
    });
  }
  function changeRequirement(requirementId: string) {
    result.form.setFieldValue('requirementId', requirementId);
    const next: EventContext =
      context?.kind === 'new'
        ? context
        : requirementId
          ? { kind: 'activity', requirementId, ...(eventId ? { eventId } : {}) }
          : eventId
            ? { kind: 'event', eventId }
            : { kind: 'new' };
    setContext(next);
    void navigate({
      ...destination(next, requirementId),
      params: { calendarId: record.id },
      search: (previous) => previous,
      hashScrollIntoView: false,
    });
  }
  return {
    ...result,
    context,
    open,
    eventId,
    linkUnlocked,
    unlockLink: () => setLinkUnlocked(true),
    edit,
    prepare,
    discard,
    resume,
    changeRequirement,
    panel,
    /** Consult an activity in the side panel without opening a form. */
    view,
    viewEvent: (eventId: string) => {
      rememberOpener();
      setPanel({ kind: 'event', eventId });
    },
    viewTeacherDay: () => {
      rememberOpener();
      setPanel({ kind: 'teacher-day' });
    },
    close: () => {
      if (result.pending) return;
      if (!open) {
        // Closing a panel that is only consulting returns focus once; with none open, nothing.
        if (panel) {
          setPanel(null);
          setReturnFocus('editor-section-title');
        }
        return;
      }
      if (!dirty) {
        discard();
        return;
      }
      setOpen(false);
      setPanel(null);
      setReturnFocus('resume-event');
    },
    newEvent: () => {
      if (readOnly || result.pending) return;
      if (context && dirty) {
        setReturnFocus('pending-event-title');
        return;
      }
      begin({ kind: 'new' }, emptyEvent(calendarOfferIds));
    },
  };
}
type Controller = ReturnType<typeof useController>;
const Context = createContext<Controller | null>(null);
export function EventEditorProvider({ children }: PropsWithChildren) {
  return <Context.Provider value={useController()}>{children}</Context.Provider>;
}
export function useEventEditor() {
  const context = useContext(Context);
  if (!context) throw new Error('O formulário de evento precisa da sessão do calendário.');
  return context;
}
