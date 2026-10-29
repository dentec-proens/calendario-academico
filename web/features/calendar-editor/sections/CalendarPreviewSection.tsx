import { proensLayout } from '#src/printing/calendar-layout.ts';
import logoUrl from '../../../../assets/printing/ifpr-logo.png?url';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarExport } from '../export/CalendarExportProvider.tsx';
import '../../../../assets/printing/calendar.css';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import EventRecordDetails from '../events/EventRecordDetails.tsx';

export default function CalendarPreviewSection() {
  const { state, events, evaluation, record, dirty, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const activities = new Map(activityChecklist(state).map((item) => [item.id, item.name]));
  const exporting = useCalendarExport();
  return (
    <section id="calendar" className="view">
      <div className="panel">
        <div className="calendar-heading">
          <h3 id="calendar-title">
            {state.year} · {state.campus}
          </h3>
          <div className="actions">
            <button
              type="button"
              id="print"
              disabled={exporting.pending}
              onClick={() => {
                void exporting.print();
              }}
            >
              Imprimir ou salvar PDF
            </button>
          </div>
        </div>
        {dirty && (
          <p role="status">
            Prévia das alterações aplicadas. A impressão aguarda confirmação do salvamento.
          </p>
        )}
        <div
          id="months"
          dangerouslySetInnerHTML={{
            __html: proensLayout(state, events, evaluation, record, logoUrl),
          }}
        />
      </div>
      <div className="panel" id="calendar-records">
        <h3>Registros do calendário</h3>
        <p className="help">
          Datas institucionais e registros do campus, com vínculo, efeito e ofertas.
        </p>
        <ul id="calendar-record-list" className="records">
          {[...events]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((event) => (
              <li key={event.id}>
                <div>
                  <EventRecordDetails
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
      </div>
    </section>
  );
}
