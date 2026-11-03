import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import {
  createCampusDate,
  planActivityDate,
  updateDate,
} from '#src/domain/calendar/commands/events.ts';
import {
  generatedActivities,
  generatedActivity,
  linksToReview,
} from '#src/domain/calendar/activities/links.ts';
import {
  activityFromKey,
  activityKey,
  isAssessmentStage,
} from '#src/domain/calendar/activities/activity-ref.ts';
import { rulesetVersion } from '#src/domain/policies/registry.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { editorPages } from '../editor-steps.ts';

/** Every date is filled in the Activities step; assessment intervals in their own area. */
function destination(context: EventContext | null) {
  // A date edited as a date (campus or under review) stays in the Activities step.
  if (context?.kind === 'activity' && isAssessmentStage(activityFromKey(context.key)))
    return { to: editorPages.periods.path, hash: 'assessment-area' };
  return { to: editorPages.events.path, hash: '' };
}

const noSubscription = () => () => {};

/**
 * Form identity of a date: drafts are kept by calendar and date ID, never by
 * activity key, so two dates of one activity have independent drafts. A new date receives its ID
 * when its form opens; `event` alone is the idle form, with no date.
 */
const dateFormId = (dateId: string | null) => (dateId ? `event:${dateId}` : 'event');

function useController() {
  const { state, institutional, session, record, notify, readOnly, formEpoch } =
    useCalendarEditor();
  const navigate = useNavigate();
  const drafts = useFormDrafts();
  const calendarOfferIds = useMemo(() => state.offers.map((offer) => offer.id), [state.offers]);
  const [context, setContext] = useState<EventContext | null>(null);
  const [open, setOpen] = useState(false);
  /** The saved date being edited; null for a new date. */
  const [eventId, setEventId] = useState<string | null>(null);
  /** The date whose draft the form holds: the saved date or the ID given to a new one. */
  const [dateId, setDateId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<EventValues | null>(null);
  /** Saved dates whose drafts were left pending for another saved date, with their context. */
  const [background, setBackground] = useState<ReadonlyMap<string, EventContext>>(new Map());
  // What the side panel shows besides the form: an activity (by its key) or an observance.
  const [panel, setPanel] = useState<
    | { kind: 'activity'; key: string }
    | { kind: 'event'; eventId: string }
    | { kind: 'observance'; key: string }
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
    (key: string) => {
      rememberOpener();
      setPanel({ kind: 'activity', key });
    },
    [rememberOpener],
  );
  const viewEvent = useCallback(
    (eventId: string) => {
      rememberOpener();
      setPanel({ kind: 'event', eventId });
    },
    [rememberOpener],
  );
  const formId = dateFormId(dateId);
  const result = useCalendarForm(
    formId,
    (dateId && defaults) || emptyEvent(calendarOfferIds),
    function apply(value) {
      const id = dateId ?? crypto.randomUUID();
      // The link comes from the context, never from the form: a saved date keeps its own, a date
      // planned from an activity takes that activity and a new date of the campus has none.
      session.apply((current) => {
        const ready = { ...current, rulesetVersion: rulesetVersion(current) };
        const date = eventFromValues(value, {
          id,
          base: current.events.find((event) => event.id === eventId),
        });
        if (eventId) return updateDate(ready, date, institutional);
        if (context?.kind !== 'activity') return createCampusDate(ready, date, institutional);
        const activity = activityFromKey(context.key);
        if (!activity) throw new Error('Atividade inválida para este calendário.');
        return planActivityDate(ready, activity, date, institutional);
      });
      if (context?.kind === 'activity') {
        // A saved period returns to the activity, where it now appears in the list.
        setContext(null);
        setOpen(false);
        setEventId(null);
        setDateId(null);
        setPanel({ kind: 'activity', key: context.key });
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('#event-panel [data-prepare-activity]')?.focus(),
        );
        return;
      }
      setEventId(id);
      setContext({ kind: 'event', eventId: id });
    },
    {
      successMessage: (value) =>
        `Data “${value.name}” aplicada. Confira o indicador de salvamento.`,
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
    setDateId(null);
    setBackground(new Map());
    setPanel(null);
    eventForm.reset(emptyEvent(calendarOfferIds));
    clearDraft();
    drafts?.clearScope(`calendar:${record.id}:event:`);
  }, [formEpoch, eventForm, clearDraft, drafts, record.id, calendarOfferIds]);
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
    if (event) result.form.reset(eventValues(event));
  }, [dirty, eventId, record.version, result.form, state.events, calendarOfferIds]);
  /** Saved dates with an unapplied draft out of the form: left for another date, or closed. */
  const draftPrefix = `calendar:${record.id}:event:`;
  const pendingKey = useSyncExternalStore(
    drafts?.subscribe ?? noSubscription,
    () =>
      [...background.keys()]
        .filter((id) => id !== eventId && drafts?.isEditing(draftPrefix + id))
        .concat(eventId && dirty && !open ? [eventId] : [])
        .join('\n'),
    () => '',
  );
  const pendingDates = useMemo(
    () => new Set(pendingKey ? pendingKey.split('\n') : []),
    [pendingKey],
  );

  function canOpen(next: EventContext, id: string | null) {
    if (readOnly || result.pending) return false;
    if (context && JSON.stringify(context) === JSON.stringify(next)) {
      setOpen(true);
      return false;
    }
    // The draft of a saved date stays pending under its own ID while another saved date opens;
    // the draft of a new date has no row to return to, so it is continued or discarded first.
    if (context && dirty && !(eventId && id)) {
      notify(
        'Há um preenchimento em andamento. Retome-o ou use Descartar alterações antes de abrir outra data.',
        true,
      );
      return false;
    }
    return true;
  }
  function begin(next: EventContext, values: EventValues, id: string | null = null) {
    const same = context && JSON.stringify(context) === JSON.stringify(next);
    if (!canOpen(next, id) && !same) return;
    if (readOnly) return;
    if (!same) rememberOpener();
    void navigate({
      ...destination(next),
      params: { calendarId: record.id },
      search: (previous) => previous,
      hashScrollIntoView: false,
    });
    if (same) return;
    const nextId = id ?? crypto.randomUUID();
    setBackground((current) => {
      const kept = new Map(current);
      if (context && eventId && dirty) kept.set(eventId, context);
      kept.delete(nextId);
      return kept;
    });
    // The form adopts the draft of this date, when there is one, or these values.
    setDefaults(values);
    setDateId(nextId);
    setContext(next);
    setEventId(id);
    setPanel(next.kind === 'activity' ? { kind: 'activity', key: next.key } : null);
    setOpen(true);
    return true;
  }
  function openOrganization(key: string) {
    setOpen(false);
    setPanel(null);
    void navigate({
      to: editorPages.periods.path,
      params: { calendarId: record.id },
      search: (previous) => ({ ...previous, atividade: key }),
      hashScrollIntoView: false,
    });
  }
  function edit(id: string) {
    const event = state.events.find((item) => item.id === id);
    if (!event) return;
    // A stage under review is no longer in the organization form: it is edited as a date.
    const review = linksToReview(state).has(id);
    const generated = review
      ? undefined
      : generatedActivity(generatedActivities(state), event.activity);
    if (isAssessmentStage(event.activity) && generated) {
      openOrganization(activityKey(generated.activity));
      return;
    }
    if (id.startsWith('teacher-vacation-')) {
      void navigate({ to: '/calendarios/$calendarId/ferias', params: { calendarId: record.id } });
      return;
    }
    // A link without generated activity is edited as a date; its link is kept as recorded.
    const next: EventContext = generated
      ? { kind: 'activity', key: activityKey(generated.activity), eventId: id }
      : { kind: 'event', eventId: id };
    begin(next, eventValues(event), id);
  }
  function prepare(key: string) {
    if (isAssessmentStage(activityFromKey(key))) {
      openOrganization(key);
      return;
    }
    const requirement = generatedActivities(state).get(key);
    if (!requirement) return;
    begin({ kind: 'activity', key }, activityDraft(state, requirement));
  }
  function discard() {
    if (result.pending) return;
    result.form.reset(emptyEvent(calendarOfferIds));
    result.clearDraft();
    session.setFormDirty(formId, false);
    setContext(null);
    setOpen(false);
    setEventId(null);
    setDateId(null);
    setPanel(null);
    setReturnFocus('new-event');
  }
  async function resume() {
    await navigate({
      // Resuming leads to the step where the draft's record is listed.
      ...destination(context),
      params: { calendarId: record.id },
      search: (previous) => previous,
      hashScrollIntoView: false,
    });
    setPanel(context?.kind === 'activity' ? { kind: 'activity', key: context.key } : null);
    setOpen(true);
    requestAnimationFrame(() => {
      const heading = document.getElementById('event-form-title');
      heading?.focus({ preventScroll: true });
      scrollIntoView(heading, { block: 'start' });
    });
  }
  /** Leave the form for the activity view; an unapplied draft stays pending, as on closing. */
  function backToActivity() {
    if (result.pending || context?.kind !== 'activity') return;
    if (dirty) setOpen(false);
    else {
      result.form.reset(emptyEvent(calendarOfferIds));
      result.clearDraft();
      setContext(null);
      setOpen(false);
      setEventId(null);
      setDateId(null);
    }
    setPanel({ kind: 'activity', key: context.key });
    requestAnimationFrame(() =>
      (
        document.getElementById('panel-resume-event') ??
        document.querySelector<HTMLElement>('#event-panel [data-prepare-activity]')
      )?.focus(),
    );
  }
  const saved = eventId ? state.events.find((event) => event.id === eventId) : undefined;
  return {
    ...result,
    context,
    open,
    eventId,
    /** Link of the date in the form: the saved one, or the activity being filled. */
    activity: saved
      ? saved.activity
      : context?.kind === 'activity'
        ? activityFromKey(context.key)
        : undefined,
    pendingDates,
    backToActivity,
    edit,
    prepare,
    discard,
    resume,
    panel,
    /** Consult an activity in the side panel without opening a form. */
    view,
    viewEvent,
    viewObservance: (key: string) => {
      rememberOpener();
      setPanel({ kind: 'observance', key });
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
