import CreateCalendarForm from './CreateCalendarForm.tsx';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
import type { PaginationState } from '../../shared/forms/Pagination.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { CopyPlus, Eye, Pencil, Trash2 } from 'lucide-react';
import { canCreateVersion, isDeletable, isEditable } from '#src/domain/calendar/lifecycle.ts';
import { StatusBadge } from '../lifecycle/LifecycleActions.tsx';
import { useNavigate } from '@tanstack/react-router';
import { calendarName } from '#src/domain/calendar/label.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useRouteForm } from '../../app/navigation.ts';
import { Link } from '@tanstack/react-router';
import { updatedLabel } from '../../shared/dates.ts';

export default function CalendarsPanel({
  info,
  canSelectCampus,
  filter,
  onFilter,
  notify,
  pagination,
}: {
  info: Bootstrap;
  canSelectCampus: boolean;
  filter: string;
  onFilter: (id: string) => void;
  notify: Notify;
  pagination: PaginationState;
}) {
  const [creating, setCreating] = useRouteForm('calendars');
  const navigate = useNavigate();
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
        notify('Calendário movido para a lixeira. Você pode restaurá-lo na Lixeira.');
      },
    });
  }

  function newVersion(calendar: Bootstrap['calendars'][number]) {
    void confirmAction({
      title: 'Criar nova versão?',
      description: `Um novo rascunho será criado com o conteúdo de “${calendar.name}”.`,
      consequence:
        'O calendário publicado continua vigente até que a nova versão seja revisada e publicada. O parecer não é copiado.',
      confirmLabel: 'Criar nova versão',
      pendingLabel: 'Criando…',
      intent: 'primary',
      onConfirm: async () => {
        const created = await calendarClient.createVersion(calendar.id);
        await navigate({
          to: '/calendarios/$calendarId/editar',
          params: { calendarId: created.id },
        });
      },
    });
  }

  return (
    <section id="calendars" className="page">
      <CollectionPanel
        actionLabel="Novo calendário"
        formTitle="Criar calendário"
        formOpen={creating}
        onFormOpen={setCreating}
        form={<CreateCalendarForm info={info} canSelectCampus={canSelectCampus} />}
      >
        <div className="calendar-list-tools">
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
          <Link
            to="/calendarios/lixeira"
            search={{ campus: filter || undefined }}
            className="calendar-trash-link"
          >
            Lixeira
          </Link>
        </div>
        <ul id="calendar-list" className="records">
          {calendars.length ? (
            calendars.map((c) => (
              <li key={c.id} data-calendar-campus={c.campusId}>
                <div className="calendar-list-details">
                  <strong>
                    <StatusBadge status={c.status} /> {c.name}
                  </strong>
                  {c.seiProcess ? (
                    <small className="calendar-list-sei">Processo SEI nº {c.seiProcess}</small>
                  ) : null}
                  {c.supersededByName ? <small>Substituído por {c.supersededByName}</small> : null}
                  <p className="calendar-list-offering">
                    {c.name ===
                    calendarName(
                      c.year,
                      info.campuses.find((campus) => campus.id === c.campusId)?.name,
                      c.label,
                    ) ? null : (
                      <>
                        {info.campuses.find((campus) => campus.id === c.campusId)?.name} · {c.year}{' '}
                        ·{' '}
                      </>
                    )}
                    {c.offerKinds.map((m) => modalityLabels[m] || m).join(' + ')}
                  </p>
                  {(c.courses || c.classes || c.shifts) && (
                    <p className="calendar-list-courses">
                      {c.courses}
                      {(c.classes || c.shifts) && (
                        <span>{[c.classes, c.shifts].filter(Boolean).join(' · ')}</span>
                      )}
                    </p>
                  )}
                  <div className="calendar-list-authorship">
                    <small>Criado por: {c.createdByName || 'Autoria não registrada'}</small>
                    <small>
                      Última alteração por: {c.updatedByName || 'Autoria não registrada'} ·{' '}
                      {updatedLabel(c.updatedAt)}
                    </small>
                  </div>
                </div>
                <Link to="/calendarios/$calendarId/editar" params={{ calendarId: c.id }}>
                  {isEditable(c.status) ? (
                    <>
                      <Pencil aria-hidden="true" size={18} />
                      Editar
                    </>
                  ) : (
                    <>
                      <Eye aria-hidden="true" size={18} />
                      Abrir
                    </>
                  )}
                </Link>
                {canCreateVersion(c.status, info.user.role) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    data-new-version={c.id}
                    onClick={() => newVersion(c)}
                  >
                    <CopyPlus aria-hidden="true" size={18} />
                    Nova versão
                  </Button>
                ) : null}
                {isDeletable(c.status) ? (
                  <Button
                    type="button"
                    variant="danger"
                    data-delete-calendar={c.id}
                    onClick={() => remove(c)}
                  >
                    <Trash2 aria-hidden="true" size={18} />
                    Excluir calendário
                  </Button>
                ) : null}
              </li>
            ))
          ) : pagination.status === 'LoadingFirstPage' ? null : (
            <li>
              {filter
                ? 'Nenhum calendário registrado para este campus.'
                : 'Nenhum calendário registrado nesta conta.'}
            </li>
          )}
        </ul>
        <Pagination
          pagination={pagination}
          label="Carregar mais calendários"
          loadingLabel="Carregando calendários…"
        />
      </CollectionPanel>
    </section>
  );
}
