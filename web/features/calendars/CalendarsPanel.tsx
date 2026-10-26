import CreateCalendarForm from './CreateCalendarForm.tsx';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
import type { TrashData } from '../../shared/convex/types.ts';
import type { PaginationState } from '../../shared/forms/Pagination.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { ArchiveRestore, ExternalLink, FileUp, Trash2 } from 'lucide-react';
import { calendarName } from '../../../src/calendar-label.ts';
import { modalityLabels } from '../../../src/modalities.ts';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import { useAction } from '../../shared/forms/useAction.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useRouteForm } from '../../app/navigation.ts';
import { Link } from '@tanstack/react-router';

export function updatedLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Data não disponível';
}

export default function CalendarsPanel({
  info,
  canSelectCampus,
  filter,
  onFilter,
  notify,
  liveTrash,
  pagination,
  trashPagination,
}: {
  info: Bootstrap;
  canSelectCampus: boolean;
  filter: string;
  onFilter: (id: string) => void;
  notify: Notify;
  liveTrash?: TrashData;
  pagination: PaginationState;
  trashPagination: PaginationState;
}) {
  const [creating, setCreating] = useRouteForm('calendars');
  const trash = liveTrash?.calendars ?? [];
  const trashLoading = liveTrash === undefined;
  const { pending, run } = useAction(notify);
  const calendars = info.calendars.filter((calendar) => !filter || calendar.campusId === filter);

  function remove(calendar: Bootstrap['calendars'][number]) {
    void confirmAction({
      title: 'Mover calendário para a lixeira?',
      description: `O calendário “${calendar.name}” sairá das listas de trabalho e pareceres.`,
      consequence: 'Seus dados e documentos serão preservados para restauração.',
      intent: 'danger',
      confirmLabel: 'Mover para a lixeira',
      pendingLabel: 'Movendo…',
      onConfirm: async () => {
        await calendarClient.remove(calendar.id, calendar.version);
        notify('Calendário movido para a lixeira. Você pode restaurá-lo abaixo.');
      },
    });
  }

  return (
    <section id="calendars" className="page" aria-busy={pending}>
      <CollectionPanel
        title="Calendários registrados"
        actionLabel="Novo calendário"
        formTitle="Criar calendário"
        formOpen={creating}
        onFormOpen={setCreating}
        busy={pending}
        form={<CreateCalendarForm info={info} canSelectCampus={canSelectCampus} />}
      >
        <p className="help">Horários de Brasília</p>
        {canSelectCampus ? (
          <label id="filter-label">
            Filtrar por campus
            <select id="campus-filter" value={filter} onChange={(e) => onFilter(e.target.value)}>
              <option value="">Todos os campi</option>
              {info.campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ul id="calendar-list" className="records">
          {calendars.length ? (
            calendars.map((c) => (
              <li key={c.id} data-calendar-campus={c.campusId}>
                <div>
                  <strong>
                    {c.purpose === 'test' ? '[TESTE] ' : '[DEFINITIVO] '}
                    {c.name}
                  </strong>
                  <small>
                    {c.name ===
                    calendarName(
                      c.year,
                      info.campuses.find((campus) => campus.id === c.campusId)?.name,
                    ) ? null : (
                      <>
                        {info.campuses.find((campus) => campus.id === c.campusId)?.name} · {c.year}{' '}
                        ·{' '}
                      </>
                    )}
                    {(c.modalities || [c.offer]).map((m) => modalityLabels[m] || m).join(' + ')}
                  </small>
                  <small>Última atualização: {updatedLabel(c.updatedAt)}</small>
                  <small>
                    {c.courses}
                    {c.classes ? ' · ' + c.classes : ''}
                    {c.shifts ? ' · ' + c.shifts : ''}
                  </small>
                </div>
                <Link to="/calendarios/$calendarId/editar" params={{ calendarId: c.id }}>
                  <ExternalLink aria-hidden="true" size={18} />
                  Abrir calendário
                </Link>
                <Link to="/calendarios/$calendarId/historico" params={{ calendarId: c.id }}>
                  <FileUp aria-hidden="true" size={18} />
                  Enviar calendário anterior
                </Link>
                <Button
                  type="button"
                  variant="danger"
                  data-delete-calendar={c.id}
                  disabled={pending}
                  onClick={() => remove(c)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  Excluir calendário
                </Button>
              </li>
            ))
          ) : (
            <li>
              {pagination.status === 'LoadingFirstPage'
                ? 'Carregando calendários…'
                : filter
                  ? 'Nenhum calendário registrado para este campus.'
                  : 'Nenhum calendário registrado nesta conta.'}
            </li>
          )}
        </ul>
        <Pagination pagination={pagination} label="Carregar mais calendários" />
        <details className="panel calendar-trash">
          <summary>Lixeira de calendários</summary>
          {trash.length ? <p>Os dados e documentos são preservados para restauração.</p> : null}
          <ul id="calendar-trash-list" className="records">
            {trashLoading ? (
              <li>Carregando lixeira…</li>
            ) : trash.length ? (
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
          <Pagination pagination={trashPagination} label="Carregar mais calendários da lixeira" />
        </details>
      </CollectionPanel>
    </section>
  );
}
