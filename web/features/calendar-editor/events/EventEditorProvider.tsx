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
import {
  activityDraft,
  emptyEvent,
  eventFromValues,
  eventTypeOf,
  eventValues,
  type EventContext,
  type EventValues,
} from './event-draft.ts';
import { applyEvent, recalculateCalendar } from '../../../../src/calendar-edits/commands.ts';
import { activityChecklist, stageRequirement } from '../../../../src/obligations.ts';
import { suggestStages } from '../../../../src/stage-suggestions.ts';
import { proposedDates } from '../../../../src/history-dates.ts';
import { rulesetVersion } from '../../../../src/calendar-rules/index.ts';
import { historyCandidateKey, historicalOccurrence } from '../../../../src/history-progress.ts';
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
  const [linkUnlocked, setLinkUnlocked] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [returnFocus, setReturnFocus] = useState<
    'resume-event' | 'new-event' | 'pending-event-title' | null
  >(null);
  const result = useCalendarForm(
    'event',
    emptyEvent(state.modalities),
    function apply(value) {
      const id = eventId || crypto.randomUUID();
      if (context?.kind === 'history' && context.intent === 'link') {
        // Linking provenance touches nothing else of the existing record.
        session.apply((current) => {
          const saved = current.events.find((event) => event.id === eventId);
          if (!saved) throw new Error('O evento não existe mais. Reabra o calendário.');
          return applyEvent(current, { ...saved, historicalSource: source }, institutional, true);
        });
        return;
      }
      session.apply((current) =>
        applyEvent(
          { ...current, rulesetVersion: rulesetVersion(current) },
          eventFromValues(value, {
            id,
            base: current.events.find((event) => event.id === eventId),
            historicalSource: source,
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
    setLinkUnlocked(false);
    eventForm.reset(emptyEvent(state.modalities));
    clearDraft();
    session.setFormDirty('event', false);
  }, [formEpoch, eventForm, clearDraft, session, state.modalities]);
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
    if (readOnly || result.pending) return false;
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
    if (!same && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
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
    setSource(historicalSource);
    setLinkUnlocked(false);
    setOpen(true);
    return true;
  }
  function edit(id: string) {
    const event = state.events.find((item) => item.id === id);
    if (!event) return;
    if (id.startsWith('teacher-vacation-')) {
      void navigate({ to: '/calendarios/$calendarId/ferias', params: { calendarId: record.id } });
      return;
    }
    const next: EventContext = event.requirementId
      ? { kind: 'activity', requirementId: event.requirementId, eventId: id }
      : { kind: 'event', eventId: id };
    begin(next, eventValues(event, state.modalities), id, event.historicalSource);
  }
  function prepare(requirementId: string) {
    const requirement = activityChecklist(state).find((item) => item.id === requirementId);
    if (!requirement) return;
    begin({ kind: 'activity', requirementId }, activityDraft(state, requirement));
  }
  function history(
    history: History,
    candidate: HistoryAnalysis['candidates'][number],
    intent: 'reference' | 'new' = 'new',
    analysis?: HistoryAnalysis,
  ) {
    const candidateKey = historyCandidateKey(candidate);
    const dates =
      intent === 'reference'
        ? historicalOccurrence(history, analysis, candidate).dates
        : proposedDates(candidate, state.year);
    begin(
      { kind: 'history', historyId: history.id, candidateKey, intent },
      {
        ...emptyEvent(state.modalities),
        ...dates,
        historyWarning:
          intent === 'reference' && 'warning' in dates
            ? String(dates.warning)
            : 'Nova ocorrência: preencha datas e fonte próprias. Nenhuma data foi deslocada do calendário anterior.',
        recordType: intent === 'reference' ? 'prior-reference' : 'event',
        name: candidate.name,
        category: candidate.category,
        kind: 'note',
        eventType:
          intent === 'reference' ? '' : eventTypeOf({ kind: 'note', category: candidate.category }),
      },
      null,
      {
        historyId: history.id,
        page: candidate.page,
        candidateKey,
        analysisId: analysis?.analysisId,
      },
    );
  }
  function linkHistory(
    history: History,
    candidate: HistoryAnalysis['candidates'][number],
    existingId: string,
    analysis: HistoryAnalysis,
  ) {
    const existing = state.events.find((event) => event.id === existingId);
    if (!existing) {
      notify(
        'Eventos institucionais não podem receber procedência histórica local. Registre uma referência própria.',
        true,
      );
      return;
    }
    const candidateKey = historyCandidateKey(candidate);
    const source = {
      historyId: history.id,
      analysisId: analysis.analysisId,
      candidateKey,
      page: candidate.page,
    };
    if (
      begin(
        {
          kind: 'history',
          historyId: history.id,
          candidateKey,
          intent: 'link',
          eventId: existingId,
        },
        eventValues(existing, state.modalities),
        existingId,
        source,
      )
    )
      result.form.setFieldValue(
        'provenanceKey',
        `${history.id}:${analysis.analysisId ?? 'legacy'}:${candidateKey}`,
      );
  }
  function discard() {
    if (result.pending) return;
    result.form.reset(emptyEvent(state.modalities));
    result.clearDraft();
    session.setFormDirty('event', false);
    setContext(null);
    setOpen(false);
    setEventId(null);
    setSource(undefined);
    setLinkUnlocked(false);
    setReturnFocus('new-event');
  }
  async function resume() {
    await navigate({
      ...destination(context, result.form.state.values.requirementId),
      params: { calendarId: record.id },
      search: (previous) => previous,
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
  function applyStages() {
    const value = result.form.state.values;
    if (!value.evidence.trim()) {
      notify('Informe a fonte antes de aplicar as etapas.', true);
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
    linkUnlocked,
    unlockLink: () => setLinkUnlocked(true),
    edit,
    prepare,
    history,
    linkHistory,
    discard,
    resume,
    applyStages,
    changeRequirement,
    close: () => {
      if (result.pending) return;
      if (!dirty) {
        discard();
        return;
      }
      setOpen(false);
      setReturnFocus('resume-event');
    },
    newEvent: () => {
      if (readOnly || result.pending) return;
      if (context && dirty) {
        setReturnFocus('pending-event-title');
        return;
      }
      begin({ kind: 'new' }, emptyEvent(state.modalities));
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
