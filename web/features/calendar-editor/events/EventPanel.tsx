import { useWorkRisk } from '../../../shared/forms/useWorkRisk.ts';
import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PanelDialog, PanelHeader } from '../../../components/ui/Panel.tsx';
import { activityChecklist } from '../../../../src/domain/calendar/activities/checklist.ts';
import { teacherDayId } from '../../../../src/domain/institution/teacher-day.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useAppSession } from '../../../app/session.tsx';
import TeacherDayForm from '../forms/TeacherDayForm.tsx';
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
  const { state, events, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  const { editorRecovery, maintenance } = useAppSession();
  const paused = Boolean(editorRecovery || maintenance);
  // Keep the access notice reachable while preserving the panel and its draft.
  const open = (editor.open || editor.panel !== null) && !paused;
  useWorkRisk('interaction', open);
  const activityId = editor.open
    ? editor.context?.kind === 'activity'
      ? editor.context.requirementId
      : ''
    : editor.panel?.kind === 'activity'
      ? editor.panel.requirementId
      : '';
  const activity = activityChecklist(state).find((item) => item.id === activityId);
  const teacherDay =
    !editor.open && editor.panel?.kind === 'teacher-day'
      ? events.find((event) => event.id === teacherDayId)
      : undefined;
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
  return (
    <PanelDialog
      id="event-panel"
      className="ui-panel-dialog--side"
      open={open}
      aria-labelledby="event-panel-title"
      onClose={editor.close}
    >
      <PanelHeader
        title={
          activity?.name ??
          campusEvent?.name ??
          (teacherDay ? 'Dia do Professor' : 'Evento do campus')
        }
        titleId="event-panel-title"
        closeId="close-event-panel"
        disabled={editor.pending}
        onClose={editor.close}
      />
      {activity && (
        <ActivityDetails item={activity} detailOpen={search.atividade === activity.id} />
      )}
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
                Descartar preenchimento
              </button>
            </>
          }
        >
          <p>
            Há alterações ainda não aplicadas em{' '}
            <strong>{editor.values.name.trim() || 'Novo evento'}</strong>. Continue ou descarte esse
            preenchimento antes de abrir outro.
          </p>
        </Notice>
      )}
      {campusEvent && <CampusEventDetails event={campusEvent} />}
      {teacherDay && (
        <TeacherDayForm
          date={teacherDay.originalStart || teacherDay.start}
          onClose={editor.close}
        />
      )}
      <EventEditor />
    </PanelDialog>
  );
}
