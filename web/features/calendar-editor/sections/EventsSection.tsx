import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import ActivityChecklist from '../events/ActivityChecklist.tsx';
import ActivityFilters from '../events/ActivityFilters.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

/** One step for what the resolution asks to contemplate and for every date of the calendar. */
export default function EventsSection() {
  const { readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  return (
    <section id="events" className="view">
      <div className="panel">
        <p className="help">
          Atividades da Resolução e datas próprias do campus: feriados municipais, recessos,
          reposições e eventos locais.
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
              <strong>{editor.values.name.trim() || 'Nova data'}</strong>. Continue esse
              preenchimento ou descarte as alterações antes de adicionar outra data.
            </p>
          </Notice>
        )}
        <ActivityFilters />
        <ActivityChecklist />
      </div>
    </section>
  );
}
