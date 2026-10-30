import { usePaginatedQuery } from 'convex/react';
import { ArchiveRestore } from 'lucide-react';
import { useAppSession } from '../../app/session.tsx';
import { useFeatureRoute } from '../../app/navigation.ts';
import { BackLink } from '../../components/ui/BackLink.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { functions } from '../../shared/convex/client.ts';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import { useAction } from '../../shared/forms/useAction.ts';
import Pagination from '../../shared/forms/Pagination.tsx';

export default function CalendarTrashPage() {
  const { notify } = useAppSession();
  const { campus } = useFeatureRoute();
  const { pending, run } = useAction(notify);
  const trashPagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    { deleted: true },
    { initialNumItems: 50 },
  );
  const trash = trashPagination.results;
  const trashLoading = trashPagination.status === 'LoadingFirstPage';
  return (
    <section className="page" aria-busy={pending}>
      <BackLink to="/calendarios" search={{ campus: campus || undefined }}>
        Voltar aos calendários
      </BackLink>
      <div className="panel calendar-trash">
        <p>Os dados e documentos são preservados para restauração.</p>
        <ul id="calendar-trash-list" className="records">
          {trashLoading ? null : trash.length ? (
            trash.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <small>Excluído em {new Date(c.deletedAt!).toLocaleString('pt-BR')}</small>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  data-restore-calendar={c.id}
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await calendarClient.restore(c.id);
                      notify('Calendário restaurado.');
                    })
                  }
                >
                  <ArchiveRestore aria-hidden="true" size={18} />
                  Restaurar calendário
                </Button>
              </li>
            ))
          ) : (
            <li>A lixeira está vazia.</li>
          )}
        </ul>
        <Pagination
          pagination={trashPagination}
          label="Carregar mais calendários da lixeira"
          loadingLabel="Carregando lixeira…"
        />
      </div>
    </section>
  );
}
