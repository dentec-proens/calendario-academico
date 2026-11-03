import {
  hasInternalDates,
  proensLayout,
  type PrintVersion,
} from '#src/printing/calendar-layout.ts';
import logoUrl from '../../../../assets/printing/ifpr-logo.png?url';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarExport } from '../export/CalendarExportProvider.tsx';
import '../../../../assets/printing/calendar.css';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ChoiceGroup } from '../../../components/ui/ChoiceGroup.tsx';
import { applicationSearch } from '../../../app/search.ts';

const printVersions = [
  { value: 'official', label: 'Versão oficial (sem datas internas)' },
  { value: 'complete', label: 'Versão completa (com datas internas)' },
] as const;

export default function CalendarPreviewSection() {
  const { state, events, evaluation, record, dirty } = useCalendarEditor();
  const exporting = useCalendarExport();
  const search = applicationSearch(useSearch({ from: '__root__' }));
  const navigate = useNavigate();
  // The choice exists only while the calendar has internal dates (art. 18); otherwise, and by
  // default, the preview and the print are the official version.
  const internal = hasInternalDates(events);
  const version: PrintVersion =
    internal && search.impressao === 'completa' ? 'complete' : 'official';
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
                void exporting.print(version);
              }}
            >
              Imprimir ou salvar PDF
            </button>
          </div>
        </div>
        {internal && (
          <div className="print-version">
            <ChoiceGroup
              id="print-version"
              label="Versão impressa"
              value={version}
              options={printVersions}
              aria-describedby="print-version-help"
              onValueChange={(next) => {
                void navigate({
                  to: '/calendarios/$calendarId/visualizar',
                  params: { calendarId: record.id },
                  search: (previous) => ({
                    ...previous,
                    impressao: next === 'complete' ? ('completa' as const) : undefined,
                  }),
                  replace: true,
                  hashScrollIntoView: false,
                });
              }}
            />
            <p id="print-version-help" className="help">
              A versão enviada à Proens e publicada é a oficial. A versão completa acrescenta as
              datas de organização interna do campus (art. 18) e não substitui o calendário oficial.
            </p>
          </div>
        )}
        {dirty && (
          <p role="status">
            Prévia das alterações aplicadas. A impressão aguarda confirmação do salvamento.
          </p>
        )}
        <div
          id="months"
          dangerouslySetInnerHTML={{
            __html: proensLayout(state, events, evaluation, record, logoUrl, version),
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
