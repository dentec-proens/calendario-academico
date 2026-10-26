import { proensLayout } from '../../../../src/printing/calendar-layout.ts';
import logoUrl from '../../../../assets/printing/ifpr-logo.png?url';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarExport } from '../export/CalendarExportProvider.tsx';
import '../../../../assets/printing/calendar.css';

export default function CalendarPreviewSection() {
  const { state, events, evaluation, record, dirty } = useCalendarEditor();
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
              Imprimir
            </button>
            <button
              type="button"
              id="download-pdf"
              disabled={exporting.pending}
              onClick={() => {
                void exporting.pdf();
              }}
            >
              Baixar PDF
            </button>
          </div>
        </div>
        {dirty && (
          <p role="status">
            Prévia das alterações aplicadas. A impressão e o PDF aguardam confirmação do salvamento.
          </p>
        )}
        <div
          id="months"
          dangerouslySetInnerHTML={{
            __html: proensLayout(state, events, evaluation, record, logoUrl),
          }}
        />
      </div>
    </section>
  );
}
