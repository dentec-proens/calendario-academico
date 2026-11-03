import { usePaginatedQuery } from 'convex/react';
import { functions } from '../../../shared/convex/client.ts';
import Pagination from '../../../shared/forms/Pagination.tsx';
import AuditTable from '../../audit/AuditTable.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

export default function HistorySection() {
  const { record } = useCalendarEditor();
  const pagination = usePaginatedQuery(
    functions.calendars.history,
    { id: record.id },
    { initialNumItems: 50 },
  );
  return (
    <section id="operations" className="view" aria-labelledby="editor-section-title">
      <div className="panel audit-page">
        <p className="help">
          Operações deste calendário, da mais recente à mais antiga · Horário de Brasília. Versões
          anteriores têm histórico próprio.
        </p>
        {pagination.results.length > 0 ? (
          <AuditTable
            entries={pagination.results}
            label="Histórico do calendário"
            showCalendar={false}
          />
        ) : pagination.status === 'LoadingFirstPage' ? null : (
          <p id="log-message" role="status">
            Nenhuma operação registrada neste calendário.
          </p>
        )}
        <Pagination
          pagination={pagination}
          label="Carregar anteriores"
          loadingLabel="Carregando operações…"
        />
      </div>
    </section>
  );
}
