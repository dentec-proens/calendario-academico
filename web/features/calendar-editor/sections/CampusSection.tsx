import { calendarObservances, observanceIssues } from '#src/domain/calendar/observances.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import CampusEventList from '../events/CampusEventList.tsx';
import { campusEvents } from '../events/campus-events.ts';
import { Notice } from '../../../components/ui/Notice.tsx';

export default function CampusSection() {
  const { events, state, record, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  const unresolved = observanceIssues(record.institutionalEvents, state);
  const orphaned = calendarObservances(record.institutionalEvents, state).filter(
    (entry) => !entry.event,
  );
  return (
    <section id="campus-activities" className="view">
      <div className="panel">
        {unresolved.length > 0 && (
          <Notice tone="warning" title="Confira as observâncias">
            {unresolved.map((issue) => (
              <p key={`${issue.key}:${issue.message}`}>{issue.message}</p>
            ))}
          </Notice>
        )}
        {orphaned.map((entry) => (
          <p key={entry.key}>
            <button
              type="button"
              id={`open-orphan-observance-${entry.key}`}
              onClick={() => editor.viewObservance(entry.key)}
            >
              Resolver observância: {entry.label}
            </button>
          </p>
        ))}
        <div id="event-creation">
          <p className="help">
            Feriados, recessos, reposições, eventos e prazos que não correspondem a uma atividade.
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
        </div>
        <CampusEventList events={campusEvents(state, events)} />
      </div>
    </section>
  );
}
