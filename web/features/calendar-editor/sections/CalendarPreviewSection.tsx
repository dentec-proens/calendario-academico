import { proensLayout } from '#src/printing/calendar-layout.ts';
import logoUrl from '../../../../assets/printing/ifpr-logo.png?url';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarExport } from '../export/CalendarExportProvider.tsx';
import '../../../../assets/printing/calendar.css';
import { Link } from '@tanstack/react-router';

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
      <p className="calendar-dates-link">
        <Link
          id="calendar-dates"
          to="/calendarios/$calendarId/atividades"
          params={{ calendarId: record.id }}
          search={(previous) => ({ ...previous, atividadeVisao: 'data' as const })}
          hashScrollIntoView={false}
        >
          Ver por data
        </Link>{' '}
        todas as datas do calendário, com vínculo, efeito e ofertas.
      </p>
    </section>
  );
}
