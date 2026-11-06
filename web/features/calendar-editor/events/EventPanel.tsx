import { useWorkRisk } from '../../../shared/forms/useWorkRisk.ts';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PanelDialog, PanelHeader } from '../../../components/ui/Panel.tsx';
import { generatedActivities } from '#src/domain/calendar/activities/links.ts';
import { observanceRules } from '#src/domain/calendar/observances.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useAppSession, useSessionState } from '../../../app/session.tsx';
import EditorNotices from '../EditorNotices.tsx';
import ObservanceForm from '../forms/ObservanceForm.tsx';
import { useActivitySearch } from './activity-query.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import ActivityDetails from './ActivityDetails.tsx';
import EventEditor from './EventEditor.tsx';
import CampusEventDetails from './CampusEventDetails.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

/**
 * The one place where activities and campus events are filled.
 * A modal side sheet keeps the list visible behind it and closes with its button or Escape.
 */
export default function EventPanel() {
  const { state, events, readOnly, removal } = useCalendarEditor();
  const { message } = useSessionState();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  const { editorRecovery, maintenance } = useAppSession();
  const paused = Boolean(editorRecovery || maintenance);
  // Keep the access notice reachable while preserving the panel and its draft.
  const open = (editor.open || editor.panel !== null) && !paused;
  useWorkRisk('interaction', open);
  const activityKey = editor.open
    ? editor.context?.kind === 'activity'
      ? editor.context.key
      : ''
    : editor.panel?.kind === 'activity'
      ? editor.panel.key
      : '';
  const activity = activityKey ? generatedActivities(state).get(activityKey) : undefined;
  const observanceKey =
    !editor.open && editor.panel?.kind === 'observance' ? editor.panel.key : undefined;
  const observance = observanceRules(state.year).find((rule) => rule.key === observanceKey);
  const campusEventId =
    !editor.open && editor.panel?.kind === 'event' ? editor.panel.eventId : undefined;
  const campusEvent = events.find((event) => event.id === campusEventId);
  const { close: closeEditor } = editor;
  useEffect(() => {
    if (campusEventId && !campusEvent) closeEditor();
  }, [campusEventId, campusEvent, closeEditor]);
  const wasOpen = useRef(open);
  const reviewLink = search.atividade;
  useEffect(() => {
    // A review link opens its activity once; any way of closing leaves the list as it was.
    if (wasOpen.current && !open && reviewLink)
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, atividade: undefined }),
        replace: true,
        hashScrollIntoView: false,
      });
    wasOpen.current = open;
  }, [open, reviewLink, navigate]);
  const wasPaused = useRef(paused);
  useEffect(() => {
    // Pausing closes the panel once; Fechar keeps an unapplied draft for later.
    if (paused && !wasPaused.current) closeEditor();
    wasPaused.current = paused;
  }, [paused, closeEditor]);
  const focusTitle = () => document.getElementById('event-panel-title')?.focus();
  // What was announced before this panel or form opened belongs to the page behind it.
  const surface = !open ? 'closed' : editor.open ? 'form' : 'view';
  const [seen, setSeen] = useState({ surface, message, removal });
  if (seen.surface !== surface)
    setSeen(
      seen.surface === 'closed' || surface === 'form'
        ? { surface, message, removal }
        : { ...seen, surface },
    );
  return (
    <PanelDialog
      id="event-panel"
      className="ui-panel-dialog--side ui-panel-dialog--with-footer"
      open={open}
      aria-labelledby="event-panel-title"
      onClose={editor.close}
    >
      <div className="event-panel-top">
        <PanelHeader
          title={
            activity?.name ??
            campusEvent?.name ??
            (observanceKey
              ? (observance?.label ?? 'Ajuste de observância')
              : editor.eventId
                ? 'Editar data'
                : 'Nova data do campus')
          }
          titleId="event-panel-title"
          closeId="close-event-panel"
          disabled={editor.pending}
          onClose={editor.close}
        />
        <div id="event-panel-message" role="status" aria-live="polite">
          <EditorNotices
            message={!open || message === seen.message ? null : message}
            removal={!open || removal === seen.removal ? null : removal}
            onUndone={focusTitle}
            onDismissed={focusTitle}
          />
        </div>
      </div>
      {!editor.open && editor.context && editor.dirty && (
        <Notice
          as="section"
          id="panel-pending-event"
          tone="warning"
          title="Preenchimento pendente"
          titleAs="h3"
          actions={
            <>
              <button
                id="panel-resume-event"
                type="button"
                disabled={readOnly || editor.pending}
                onClick={() => {
                  void editor.resume();
                }}
              >
                Continuar preenchimento
              </button>
              <button
                id="panel-discard-event"
                type="button"
                className="secondary"
                disabled={readOnly || editor.pending}
                onClick={editor.discard}
              >
                Descartar alterações
              </button>
            </>
          }
        >
          <p>
            Há alterações ainda não aplicadas em{' '}
            <strong>{editor.values.name.trim() || 'Nova data'}</strong>. Continue ou descarte esse
            preenchimento antes de abrir outro.
          </p>
        </Notice>
      )}
      {activity && (
        <ActivityDetails item={activity} detailOpen={search.atividade === activityKey} />
      )}
      {campusEvent && <CampusEventDetails key={campusEvent.id} event={campusEvent} />}
      {observanceKey && (
        <ObservanceForm key={observanceKey} observanceKey={observanceKey} onClose={editor.close} />
      )}
      <EventEditor />
    </PanelDialog>
  );
}
