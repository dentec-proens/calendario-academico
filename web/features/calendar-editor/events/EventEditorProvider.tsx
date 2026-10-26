import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import type { CalendarEvent, History, HistoryAnalysis } from '../types.ts';
import { emptyEvent, eventValues, type EventContext, type EventValues } from './event-draft.ts';
import { applyEvent, recalculateCalendar } from '../../../../src/calendar-edits/commands.ts';
import { activityChecklist, stageRequirement } from '../../../../src/obligations.ts';
import { suggestStages } from '../../../../src/stage-suggestions.ts';
import { proposedDates } from '../../../../src/history-dates.ts';
import { historyCandidateKey } from '../../../../src/history-progress.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { calendarReferenceAnchor } from '../../../../src/calendar-reference.ts';
import { editorPages } from '../editor-steps.ts';

function destination(context: EventContext | null, requirementId: string) {
  if (context?.kind === 'history')
    return { to: editorPages.events.path, hash: calendarReferenceAnchor };
  const activity = context?.kind === 'activity' ? context.requirementId : requirementId;
  return {
    to: stageRequirement(activity) ? editorPages.assessments.path : editorPages.events.path,
    hash: '',
  };
}

function useController() {
  const { state, institutional, session, record, notify, readOnly, formEpoch } =
    useCalendarEditor();
  const navigate = useNavigate();
  const [context, setContext] = useState<EventContext | null>(null);
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [source, setSource] = useState<CalendarEvent['historicalSource']>();
  const [returnFocus, setReturnFocus] = useState<'resume-event' | 'new-event' | null>(null);
  const result = useCalendarForm(
    'event',
    emptyEvent(state.modalities),
    function apply(value) {
      if (!value.confirmed)
        throw new Error('Confirme as datas, a fonte e a aplicação à oferta selecionada.');
      const id = eventId || crypto.randomUUID();
      const event: CalendarEvent = {
        id,
        name: value.name,
        start: value.start,
        end: value.end,
        kind: value.kind,
        category: value.category,
        evidence: value.evidence,
        modalities: value.modalities,
        requirementId: value.requirementId || undefined,
        hours: value.hours ? Number(value.hours) : undefined,
        historicalSource: source,
      };
      session.apply((current) => applyEvent(current, event, institutional, Boolean(eventId)));
      setEventId(id);
      if (context?.kind !== 'activity') setContext({ kind: 'event', eventId: id });
    },
    (value) => `Evento “${value.name}” aplicado. Confira o indicador de salvamento.`,
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
    setSource(undefined);
    eventForm.reset(emptyEvent(state.modalities));
    clearDraft();
    session.setFormDirty('event', false);
  }, [formEpoch, eventForm, clearDraft, session, state.modalities]);
  useEffect(() => {
    if (!returnFocus) return;
    const frame = requestAnimationFrame(() => {
      const target =
        document.getElementById(returnFocus) ?? document.getElementById('editor-section-title');
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'start' });
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
    if (event) result.form.reset(eventValues(event, state.modalities));
  }, [dirty, eventId, record.version, result.form, state.events, state.modalities]);
  useEffect(() => {
    if (!context) session.setFormDirty('event', false);
  }, [context, session]);

  function canOpen(next: EventContext) {
    if (readOnly) return false;
    if (context && JSON.stringify(context) === JSON.stringify(next)) {
      setOpen(true);
      return false;
    }
    if (context && dirty) {
      notify(
        'Há um preenchimento em andamento. Retome-o ou use Cancelar e descartar antes de abrir outro evento.',
        true,
      );
      return false;
    }
    return true;
  }
  function begin(
    next: EventContext,
    values: EventValues,
    id: string | null = null,
    historicalSource?: CalendarEvent['historicalSource'],
  ) {
    const same = context && JSON.stringify(context) === JSON.stringify(next);
    if (!canOpen(next) && !same) return;
    if (readOnly) return;
    void navigate({
      ...destination(next, values.requirementId),
      params: { calendarId: record.id },
      hashScrollIntoView: false,
    });
    if (same) return;
    result.form.reset(values);
    setContext(next);
    setEventId(id);
    setSource(historicalSource);
    setOpen(true);
  }
  function edit(id: string) {
    const event = state.events.find((item) => item.id === id);
    if (!event) return;
    if (id.startsWith('teacher-vacation-')) {
      void navigate({ to: '/calendarios/$calendarId/ferias', params: { calendarId: record.id } });
      return;
    }
    const next: EventContext = event.requirementId
      ? { kind: 'activity', requirementId: event.requirementId }
      : { kind: 'event', eventId: id };
    begin(next, eventValues(event, state.modalities), id, event.historicalSource);
  }
  function prepare(requirementId: string) {
    const existing = state.events.find((event) => event.requirementId === requirementId);
    if (existing) {
      edit(existing.id);
      return;
    }
    const requirement = activityChecklist(state).find((item) => item.id === requirementId);
    if (!requirement) return;
    begin(
      { kind: 'activity', requirementId },
      {
        ...emptyEvent(
          requirement.modality
            ? state.modalities.filter((item) => item === requirement.modality)
            : state.modalities,
        ),
        name: requirement.name,
        requirementId,
        kind: 'note',
        category: requirementId.includes('council')
          ? 'conselho'
          : stageRequirement(requirementId)
            ? 'limite'
            : requirementId === 'cultural-week'
              ? 'evento'
              : 'prazo',
      },
    );
  }
  function history(history: History, candidate: HistoryAnalysis['candidates'][number]) {
    const candidateKey = historyCandidateKey(candidate);
    begin(
      { kind: 'history', historyId: history.id, candidateKey },
      {
        ...emptyEvent(state.modalities),
        ...proposedDates(candidate, state.year),
        name: candidate.name,
        category: candidate.category,
        kind: 'note',
      },
      null,
      { historyId: history.id, page: candidate.page, candidateKey },
    );
  }
  function discard() {
    result.form.reset(emptyEvent(state.modalities));
    result.clearDraft();
    session.setFormDirty('event', false);
    setContext(null);
    setOpen(false);
    setEventId(null);
    setSource(undefined);
    setReturnFocus('new-event');
  }
  async function resume() {
    await navigate({
      ...destination(context, result.form.state.values.requirementId),
      params: { calendarId: record.id },
      hashScrollIntoView: false,
    });
    if (context?.kind === 'history')
      document.getElementById(calendarReferenceAnchor)?.setAttribute('open', '');
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
      context?.kind === 'history' || context?.kind === 'new'
        ? context
        : requirementId
          ? { kind: 'activity', requirementId }
          : eventId
            ? { kind: 'event', eventId }
            : { kind: 'new' };
    setContext(next);
    void navigate({
      ...destination(next, requirementId),
      params: { calendarId: record.id },
      hashScrollIntoView: false,
    });
  }
  function applyStages() {
    const value = result.form.state.values;
    if (!value.confirmed || !value.evidence.trim()) {
      notify('Informe a fonte e confirme as datas antes de aplicar as etapas.', true);
      return;
    }
    try {
      session.apply((current) => {
        const suggestion = suggestStages(
          { ...current, modalities: value.modalities, offer: value.modalities[0] },
          [...institutional, ...current.events],
          value.start,
        );
        const events: CalendarEvent[] = suggestion.stages.map((stage, index) => ({
          id: crypto.randomUUID(),
          name:
            activityChecklist(current).find((item) => item.id === stage.requirementId)?.name ||
            stage.name,
          requirementId: stage.requirementId,
          start: stage.start,
          end: stage.end,
          kind: 'note',
          category: 'limite',
          evidence: value.evidence.trim(),
          modalities: value.modalities,
          assessmentAutoStart: value.start,
          historicalSource: index === 0 ? source : undefined,
        }));
        return recalculateCalendar(
          { ...current, events: [...current.events, ...events] },
          institutional,
        );
      });
      discard();
      notify('Etapas incluídas. Confira o indicador de salvamento.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível aplicar as etapas.', true);
    }
  }
  return {
    ...result,
    context,
    open,
    eventId,
    source,
    edit,
    prepare,
    history,
    discard,
    resume,
    applyStages,
    changeRequirement,
    close: () => {
      setOpen(false);
      setReturnFocus('resume-event');
    },
    newEvent: () => begin({ kind: 'new' }, emptyEvent(state.modalities)),
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
