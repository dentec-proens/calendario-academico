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
import './calendars.css';

type Calendar = Bootstrap['calendars'][number];

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

  function remove(calendar: Calendar) {
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

  function newVersion(calendar: Calendar) {
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

  const view = canSelectCampus ? 'table' : 'gallery';
  const campusName = (calendar: Calendar) =>
    info.campuses.find((campus) => campus.id === calendar.campusId)?.name;
  const actions = (calendar: Calendar) => (
    <div className="calendar-list-actions">
      <Link
        to="/calendarios/$calendarId/editar"
        params={{ calendarId: calendar.id }}
        className="ui-button ui-button--primary"
      >
        {isEditable(calendar.status) ? (
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
      {canCreateVersion(calendar.status, info.user.role) ? (
        <Button
          type="button"
          variant="secondary"
          data-new-version={calendar.id}
          aria-label={view === 'table' ? 'Nova versão' : undefined}
          title={view === 'table' ? 'Nova versão' : undefined}
          onClick={() => newVersion(calendar)}
        >
          <CopyPlus aria-hidden="true" size={18} />
          {view === 'table' ? null : 'Nova versão'}
        </Button>
      ) : null}
      {isDeletable(calendar.status) ? (
        <Button
          type="button"
          variant="danger"
          data-delete-calendar={calendar.id}
          aria-label="Excluir calendário"
          title="Excluir calendário"
          onClick={() => remove(calendar)}
        >
          <Trash2 aria-hidden="true" size={18} />
        </Button>
      ) : null}
    </div>
  );
  const courses = (calendar: Calendar) =>
    calendar.courses || calendar.classes || calendar.shifts ? (
      <p className="calendar-list-courses">
        {calendar.courses}
        {calendar.classes || calendar.shifts ? (
          <span>{[calendar.classes, calendar.shifts].filter(Boolean).join(' · ')}</span>
        ) : null}
      </p>
    ) : null;
  const offering = (calendar: Calendar) =>
    calendar.offerKinds.map((kind) => modalityLabels[kind] || kind).join(' + ');
  const references = (calendar: Calendar) => (
    <>
      {calendar.seiProcess ? (
        <small className="calendar-list-sei">Processo SEI nº {calendar.seiProcess}</small>
      ) : null}
      {calendar.supersededByName ? (
        <small className="calendar-list-superseded">
          Substituído por {calendar.supersededByName}
        </small>
      ) : null}
    </>
  );

  return (
    <section id="calendars" className="page">
      <CollectionPanel
        actionLabel="Novo calendário"
        formTitle="Criar calendário"
        formOpen={creating}
        onFormOpen={setCreating}
        form={<CreateCalendarForm info={info} canSelectCampus={canSelectCampus} />}
        toolbar={
          <div className="calendar-list-tools">
            {canSelectCampus ? (
              <label id="filter-label">
                Filtrar por campus
                <select
                  id="campus-filter"
                  value={filter}
                  onChange={(e) => onFilter(e.target.value)}
                >
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
        }
      >
        <div className="calendar-list" data-view={view}>
          {view === 'table' && calendars.length ? (
            <div className="calendar-list-heading" aria-hidden="true">
              <span>Calendário</span>
              <span>Campus</span>
              <span>Situação</span>
              <span>Última alteração</span>
              <span>Ações</span>
            </div>
          ) : null}
          <ul id="calendar-list">
            {calendars.length ? (
              calendars.map((c) =>
                view === 'table' ? (
                  <li key={c.id} data-calendar-campus={c.campusId}>
                    <div className="calendar-list-details">
                      <strong className="calendar-list-name">{c.name}</strong>
                      <p className="calendar-list-offering">{offering(c)}</p>
                      {courses(c)}
                      {references(c)}
                    </div>
                    <p className="calendar-list-campus">
                      <span className="calendar-list-cell-label">Campus: </span>
                      {campusName(c)}
                    </p>
                    <div className="calendar-list-status">
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="calendar-list-authorship">
                      <span className="calendar-list-updated">
                        <span className="calendar-list-cell-label">Última alteração em </span>
                        {updatedLabel(c.updatedAt)}
                      </span>
                      <small>por {c.updatedByName || 'autoria não registrada'}</small>
                      <small>Criado por: {c.createdByName || 'Autoria não registrada'}</small>
                    </div>
                    {actions(c)}
                  </li>
                ) : (
                  <li key={c.id} data-calendar-campus={c.campusId}>
                    <div className="calendar-list-details">
                      <StatusBadge status={c.status} />
                      <strong className="calendar-list-name">{c.name}</strong>
                      <p className="calendar-list-offering">
                        {c.name === calendarName(c.year, campusName(c), c.label) ? null : (
                          <>
                            {campusName(c)} · {c.year} ·{' '}
                          </>
                        )}
                        {offering(c)}
                      </p>
                      {courses(c)}
                      {references(c)}
                    </div>
                    <div className="calendar-list-authorship">
                      <small>Criado por: {c.createdByName || 'Autoria não registrada'}</small>
                      <small>
                        Última alteração por: {c.updatedByName || 'Autoria não registrada'} ·{' '}
                        {updatedLabel(c.updatedAt)}
                      </small>
                    </div>
                    {actions(c)}
                  </li>
                ),
              )
            ) : pagination.status === 'LoadingFirstPage' ? null : (
              <li className="calendar-list-empty">
                {filter
                  ? 'Nenhum calendário registrado para este campus.'
                  : 'Nenhum calendário registrado nesta conta.'}
              </li>
            )}
          </ul>
        </div>
        <Pagination
          pagination={pagination}
          label="Carregar mais calendários"
          loadingLabel="Carregando calendários…"
        />
      </CollectionPanel>
    </section>
  );
}
