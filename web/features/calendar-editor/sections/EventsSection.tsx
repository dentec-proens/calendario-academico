import { categoryLabel } from '../../../../src/categories.ts';
import { teacherDayId } from '../../../../src/teacher-day.ts';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import ActivityChecklist from '../events/ActivityChecklist.tsx';
import EventEditor from '../events/EventEditor.tsx';
import EventMetadataForm from '../events/EventMetadataForm.tsx';
import TeacherDayForm from '../forms/TeacherDayForm.tsx';
import HistorySection from './HistorySection.tsx';

export default function EventsSection() {
  const { events, state, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  const inActivity =
    editor.context?.kind === 'activity' ||
    (editor.context?.kind === 'new' && Boolean(editor.values.requirementId));
  return (
    <section id="events" className="view">
      <div className="panel">
        <h3>Atividades, prazos e impedimentos</h3>
        <div id="event-creation">
          <button
            id="new-event"
            type="button"
            disabled={readOnly || editor.pending}
            aria-describedby={hasPendingEvent ? 'pending-event-description' : undefined}
            onClick={editor.newEvent}
          >
            Adicionar novo evento
          </button>
          <p className="help">
            Acrescente as atividades e datas do campus e registre as fontes das decisões.
          </p>
          {hasPendingEvent && (
            <section id="pending-event" className="notice" aria-labelledby="pending-event-title">
              <h4 id="pending-event-title" tabIndex={-1}>
                Preenchimento pendente
              </h4>
              <p id="pending-event-description">
                Há alterações ainda não aplicadas em{' '}
                <strong>{editor.values.name.trim() || 'Novo evento'}</strong>. Continue esse
                preenchimento ou descarte as alterações antes de adicionar outro evento.
              </p>
              <div className="actions">
                <button
                  id="resume-pending-event"
                  type="button"
                  disabled={readOnly || editor.pending}
                  onClick={() => {
                    void editor.resume();
                  }}
                >
                  Continuar preenchimento
                </button>
                <button
                  id="discard-pending-event"
                  type="button"
                  className="secondary"
                  disabled={readOnly || editor.pending}
                  onClick={editor.discard}
                >
                  Descartar preenchimento
                </button>
              </div>
            </section>
          )}
        </div>
        <HistorySection />
        <ActivityChecklist />
        <ul id="event-list" className="records">
          {[...events]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.name}</strong>
                  <small>
                    {event.start} a {event.end} ·{' '}
                    {event.kind === 'include'
                      ? 'Inclusão letiva'
                      : event.kind === 'exclude'
                        ? 'Exclusão'
                        : 'Sem efeito na contagem'}
                  </small>
                  <small>Fonte: {event.evidence}</small>
                  {event.historicalSource && (
                    <small>
                      Origem histórica: página {event.historicalSource.page} do calendário anterior
                    </small>
                  )}
                  <small>{categoryLabel(event)}</small>
                </div>
                {event.institutional ? (
                  event.id === teacherDayId ? (
                    <TeacherDayForm date={event.originalStart || event.start} />
                  ) : (
                    <span className="institution-label">Base PROENS</span>
                  )
                ) : (
                  <>
                    <EventMetadataForm event={state.events.find((item) => item.id === event.id)!} />
                    <div className="actions">
                      <button
                        type="button"
                        data-edit-event={event.id}
                        disabled={readOnly}
                        onClick={() => editor.edit(event.id)}
                      >
                        Editar evento
                      </button>
                      <button
                        type="button"
                        data-remove-event={event.id}
                        disabled={readOnly}
                        aria-label={`Remover ${event.name}`}
                        onClick={() => {
                          if (
                            applyCommand((current) =>
                              removeEvent(current, event.id, institutional),
                            ) &&
                            editor.eventId === event.id
                          )
                            editor.discard();
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
        </ul>
        {!inActivity && editor.context?.kind !== 'history' && <EventEditor />}
      </div>
    </section>
  );
}
