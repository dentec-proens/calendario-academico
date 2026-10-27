import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { activityChecklist } from '../../../../src/obligations.ts';
import { teacherDayId } from '../../../../src/teacher-day.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useAppSession } from '../../../app/session.tsx';
import TeacherDayForm from '../forms/TeacherDayForm.tsx';
import { useActivitySearch } from './activity-query.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import ActivityDetails from './ActivityDetails.tsx';
import EventEditor from './EventEditor.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

/**
 * The one place where activities, campus events and previous-calendar occurrences are filled.
 * A modal side sheet keeps the list visible behind it and closes with its button or Escape.
 */
export default function EventPanel() {
  const { state, events, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { editorRecovery } = useAppSession();
  // While the session recovers, its notice must stay reachable; the panel reopens afterwards.
  const open = (editor.open || editor.panel !== null) && !editorRecovery;
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
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    // The provider returns focus to the action that opened the panel.
    return () => dialog.close();
  }, [open]);
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
  const { close: closeEditor } = editor;
  const recovering = Boolean(editorRecovery);
  const wasRecovering = useRef(recovering);
  useEffect(() => {
    // An expired session closes the panel once; Fechar keeps an unapplied draft for later.
    if (recovering && !wasRecovering.current) closeEditor();
    wasRecovering.current = recovering;
  }, [recovering, closeEditor]);
  return (
    <dialog
      id="event-panel"
      ref={dialogRef}
      aria-labelledby="event-panel-title"
      onCancel={(event) => {
        // Escape closes through state, so React keeps owning whether the panel is open.
        event.preventDefault();
        editor.close();
      }}
    >
      <div className="event-panel-header">
        <h2 id="event-panel-title">
          {activity?.name ??
            (teacherDay
              ? 'Dia do Professor'
              : editor.context?.kind === 'history'
                ? 'Evento do calendário anterior'
                : 'Evento do campus')}
        </h2>
        <button
          type="button"
          id="close-event-panel"
          className="secondary"
          aria-label="Fechar painel"
          onClick={editor.close}
        >
          <X aria-hidden="true" />
        </button>
      </div>
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
      {teacherDay && <TeacherDayForm date={teacherDay.originalStart || teacherDay.start} />}
      <EventEditor />
    </dialog>
  );
}
