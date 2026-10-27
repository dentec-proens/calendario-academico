import { categoryLabel } from '../../../../src/categories.ts';
import { teacherDayId } from '../../../../src/teacher-day.ts';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';
import { activityChecklist } from '../../../../src/obligations.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import ActivityChecklist from '../events/ActivityChecklist.tsx';
import EventEditor from '../events/EventEditor.tsx';
import TeacherDayForm from '../forms/TeacherDayForm.tsx';
import HistorySection from './HistorySection.tsx';
import ActivityFilters from '../events/ActivityFilters.tsx';
import { civilDate } from '../events/activity-query.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import type { EditorEvent } from '../types.ts';

function EventDetails({ event, activity }: { event: EditorEvent; activity?: string }) {
  return (
    <>
      <strong>{event.name}</strong>
      <small>
        {civilDate(event.start)} a {civilDate(event.end)} ·{' '}
        {event.kind === 'include'
          ? 'Inclusão letiva'
          : event.kind === 'exclude'
            ? 'Exclusão'
            : 'Sem efeito na contagem'}
      </small>
      {activity !== undefined && (
        <small>{activity ? `Atividade: ${activity}` : 'Sem vínculo'}</small>
      )}
      <small>Fonte: {event.evidence}</small>
      {event.recordType === 'prior-reference' && (
        <small>Referência anterior · sem efeito na contagem</small>
      )}
      {event.publicationStatus && (
        <small>
          {event.publicationStatus === 'planned'
            ? 'Publicação prevista'
            : 'Publicação realizada com fonte'}
        </small>
      )}
      {event.admission && (
        <small>
          Ingresso: {event.admission.year} ·{' '}
          {event.admission.term === 'annual'
            ? 'ciclo anual'
            : event.admission.term === 'first'
              ? 'primeiro semestre'
              : 'segundo semestre'}
        </small>
      )}
      {event.historicalSource && (
        <small>Origem histórica: página {event.historicalSource.page} do calendário anterior</small>
      )}
      <small>{categoryLabel(event)}</small>
    </>
  );
}

export default function EventsSection() {
  const { events, state, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  const activities = new Map(activityChecklist(state).map((item) => [item.id, item.name]));
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  // Records answering an activity live in its card; the rest are the campus' own events.
  const campusEvents = sorted.filter(
    (event) =>
      event.id === teacherDayId ||
      (!event.institutional && !(event.requirementId && activities.has(event.requirementId))),
  );
  const draftActivity =
    editor.context?.kind === 'activity'
      ? editor.context.requirementId
      : editor.context?.kind === 'new'
        ? editor.values.requirementId
        : '';
  const inActivity = Boolean(draftActivity) && activities.has(draftActivity);
  const editingListed =
    !inActivity &&
    editor.context?.kind !== 'history' &&
    campusEvents.some((event) => event.id === editor.eventId);
  const remove = (id: string) => {
    if (applyCommand((current) => removeEvent(current, id, institutional)) && editor.eventId === id)
      editor.discard();
  };
  return (
    <section id="events" className="view">
      <div className="panel">
        <h3>Atividades do calendário</h3>
        <ActivityFilters />
        <ActivityChecklist />
      </div>
      <div className="panel" id="campus-events">
        <h3>Outros eventos do campus</h3>
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
            Feriados, recessos, reposições, eventos e prazos que não correspondem a uma atividade da
            lista acima.
          </p>
          {hasPendingEvent && (
            <Notice
              as="section"
              id="pending-event"
              tone="warning"
              aria-labelledby="pending-event-title"
              title="Preenchimento pendente"
              titleAs="h4"
              titleProps={{ id: 'pending-event-title', tabIndex: -1 }}
              actions={
                <>
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
                </>
              }
            >
              <p id="pending-event-description">
                Há alterações ainda não aplicadas em{' '}
                <strong>{editor.values.name.trim() || 'Novo evento'}</strong>. Continue esse
                preenchimento ou descarte as alterações antes de adicionar outro evento.
              </p>
            </Notice>
          )}
          {!inActivity && editor.context?.kind !== 'history' && !editingListed && <EventEditor />}
        </div>
        <ul id="event-list" className="records">
          {campusEvents.map((event) => (
            <li key={event.id}>
              <div>
                <EventDetails event={event} />
              </div>
              {event.id === teacherDayId ? (
                <TeacherDayForm date={event.originalStart || event.start} />
              ) : (
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
                    onClick={() => remove(event.id)}
                  >
                    Remover
                  </button>
                </div>
              )}
              {editingListed && editor.eventId === event.id && <EventEditor />}
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <details id="calendar-records" className="calendar-records" open={readOnly}>
          <summary>Consultar todos os registros do calendário</summary>
          <p className="help">
            Inclui as datas institucionais e os registros vinculados às atividades.
          </p>
          <ul id="calendar-record-list" className="records">
            {sorted.map((event) => (
              <li key={event.id}>
                <div>
                  <EventDetails
                    event={event}
                    activity={event.requirementId ? activities.get(event.requirementId) : ''}
                  />
                  <small>
                    Ofertas:{' '}
                    {(event.modalities?.length ? event.modalities : state.modalities)
                      .map((modality) => modalityLabels[modality])
                      .join(', ')}
                  </small>
                </div>
                {event.institutional ? (
                  <span className="institution-label">Base PROENS</span>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    data-open-event={event.id}
                    disabled={readOnly}
                    onClick={() => editor.edit(event.id)}
                  >
                    Abrir registro
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <HistorySection />
    </section>
  );
}
