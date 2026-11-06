import CreateCalendarForm from './CreateCalendarForm.tsx';
import CreateFromCopyForm from './CreateFromCopyForm.tsx';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
import type { PaginationState } from '../../shared/forms/Pagination.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { ClipboardCheck, CopyPlus, Eye, Pencil, Trash2 } from 'lucide-react';
import {
  calendarStatuses,
  canCreateVersion,
  isDeletable,
  isEditable,
  statusLabels,
  type CalendarStatus,
} from '#src/domain/calendar/lifecycle.ts';
import { CalendarStatusBadge } from '../lifecycle/LifecycleActions.tsx';
import { useNavigate } from '@tanstack/react-router';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useFeatureRoute, useRouteForm } from '../../app/navigation.ts';
import { calendarCopyPath } from '#src/app/routes.ts';
import { Link } from '@tanstack/react-router';
import { updatedLabel } from '../../shared/dates.ts';
import CalendarIdentityCell, {
  type CalendarSummary,
} from '../calendar-list/CalendarIdentityCell.tsx';
import CalendarTable, { type CalendarColumn } from '../calendar-list/CalendarTable.tsx';
import CampusFilter from '../calendar-list/CampusFilter.tsx';
import { ResultStatus, SearchField } from '../../shared/forms/SearchField.tsx';
import { useRef } from 'react';
import './calendars.css';

export default function CalendarsPanel({
  info,
  calendars,
  canSelectCampus,
  canReview,
  filter,
  onFilter,
  situation,
  onSituation,
  searchText,
  activeSearch,
  onSearchText,
  onClearFilters,
  notify,
  pagination,
}: {
  info: Bootstrap;
  calendars: readonly CalendarSummary[];
  canSelectCampus: boolean;
  canReview: boolean;
  filter: string;
  onFilter: (id: string) => void;
  situation: CalendarStatus | '';
  onSituation: (status: CalendarStatus | '') => void;
  /** What the box shows, ahead of `activeSearch`, the search already applied to the list. */
  searchText: string;
  activeSearch: string;
  onSearchText: (text: string) => void;
  onClearFilters: () => void;
  notify: Notify;
  pagination: PaginationState;
}) {
  const [creating, setCreating] = useRouteForm('calendars');
  const { fromCopy } = useFeatureRoute();
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);

  function remove(calendar: CalendarSummary) {
    void confirmAction({
      title: 'Mover calendário para a lixeira?',
      description: `O calendário “${calendar.name}” sairá das listas de trabalho e pareceres.`,
      consequence: 'Seus dados serão preservados para restauração.',
      intent: 'danger',
      confirmLabel: 'Mover para a lixeira',
      pendingLabel: 'Movendo…',
      onConfirm: async () => {
        await calendarClient.remove(calendar.id, calendar.version);
        notify('Calendário movido para a lixeira. Você pode restaurá-lo na Lixeira.');
      },
    });
  }

  function newVersion(calendar: CalendarSummary) {
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
  const actions = (calendar: CalendarSummary) => (
    <div className="calendar-list-actions">
      <Link
        to="/calendarios/$calendarId/editar"
        params={{ calendarId: calendar.id }}
        className={`ui-button ui-button--${view === 'table' ? 'secondary' : 'primary'}`}
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
          aria-label={`Excluir calendário ${calendar.name}`}
          title="Excluir calendário"
          onClick={() => remove(calendar)}
        >
          <Trash2 aria-hidden="true" size={18} />
        </Button>
      ) : null}
    </div>
  );
  const narrowed = Boolean(situation || activeSearch);
  const loading = pagination.status === 'LoadingFirstPage' || pagination.status === 'LoadingMore';
  const empty = narrowed ? (
    <div className="calendar-list-no-match">
      <p>Nenhum calendário corresponde aos filtros.</p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          onClearFilters();
          // The button leaves with the empty state, so the focus goes back to the search.
          searchInput.current?.focus();
        }}
      >
        Limpar filtros
      </Button>
    </div>
  ) : filter ? (
    'Nenhum calendário registrado para este campus.'
  ) : (
    'Nenhum calendário registrado nesta conta.'
  );
  const found =
    calendars.length === 1
      ? '1 calendário encontrado'
      : `${calendars.length} calendários encontrados`;
  const columns: CalendarColumn<CalendarSummary>[] = [
    {
      label: 'Calendário',
      width: 'minmax(0, 1fr)',
      render: (c) => <CalendarIdentityCell calendar={c} withOrigin />,
    },
    {
      label: 'Situação',
      width: '8rem',
      render: (c) => (
        <div className="calendar-list-status">
          <span className="visually-hidden">Situação: </span>
          <CalendarStatusBadge status={c.status} />
          {canReview && c.status !== 'rascunho' ? (
            <Link
              to="/revisoes/$calendarId"
              params={{ calendarId: c.id }}
              search={{
                campus: filter || undefined,
                situacao: c.status === 'enviado' ? undefined : c.status,
              }}
              className="calendar-list-parecer"
            >
              <ClipboardCheck aria-hidden="true" size={16} />
              Abrir parecer
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      label: 'Última alteração',
      width: '13rem',
      render: (c) => (
        <div className="calendar-list-authorship">
          <span className="calendar-list-updated">
            <span className="calendar-list-cell-label">Última alteração em </span>
            {updatedLabel(c.updatedAt)}
          </span>
          <small>por {c.updatedByName || 'autoria não registrada'}</small>
          <small>Criado por: {c.createdByName || 'Autoria não registrada'}</small>
        </div>
      ),
    },
    { label: 'Ações', width: '9.5rem', render: (c) => actions(c) },
  ];

  return (
    <section id="calendars" className="page">
      <CollectionPanel
        actionLabel="Novo calendário"
        formTitle={fromCopy ? 'Novo a partir de cópia' : 'Criar calendário'}
        formOpen={creating}
        onFormOpen={setCreating}
        form={
          fromCopy ? (
            <CreateFromCopyForm info={info} canSelectCampus={canSelectCampus} />
          ) : (
            <CreateCalendarForm info={info} canSelectCampus={canSelectCampus} />
          )
        }
        secondaryAction={
          calendars.length || narrowed ? (
            <Link
              id="new-calendar-from-copy"
              to={calendarCopyPath}
              search={(previous) => previous}
              className="ui-button ui-button--secondary"
            >
              <CopyPlus size={18} aria-hidden="true" /> Novo a partir de cópia
            </Link>
          ) : null
        }
        toolbar={
          <div className="calendar-list-tools">
            <SearchField
              id="calendar-search"
              hint="Nome, campus, curso, turma ou turno"
              value={searchText}
              inputRef={searchInput}
              onChange={onSearchText}
            />
            <label id="status-filter-label">
              Situação
              <select
                id="status-filter"
                value={situation}
                onChange={(event) =>
                  onSituation(
                    calendarStatuses.find((status) => status === event.target.value) ?? '',
                  )
                }
              >
                <option value="">Todas as situações</option>
                {calendarStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            {canSelectCampus ? (
              <CampusFilter campuses={info.campuses} value={filter} onChange={onFilter} />
            ) : null}
            <Link
              to="/calendarios/lixeira"
              search={{
                campus: filter || undefined,
                situacao: situation || undefined,
                busca: activeSearch || undefined,
              }}
              className="calendar-trash-link"
            >
              Lixeira
            </Link>
          </div>
        }
      >
        <ResultStatus id="calendar-results" quiet={!loading && !calendars.length}>
          {!narrowed
            ? null
            : loading
              ? 'Buscando calendários…'
              : !calendars.length
                ? 'Nenhum calendário corresponde aos filtros.'
                : pagination.status === 'CanLoadMore'
                  ? `${found} até aqui. Use Carregar mais para continuar a busca.`
                  : `${found}.`}
        </ResultStatus>
        {view === 'table' ? (
          <CalendarTable
            id="calendar-list"
            items={calendars}
            columns={columns}
            rowProps={(c) => ({ 'data-calendar-campus': c.campusId })}
            empty={loading ? null : empty}
          />
        ) : (
          <div className="calendar-list" data-view="gallery">
            <ul id="calendar-list" className="calendar-list-items">
              {calendars.map((c) => (
                <li key={c.id} className="calendar-list-row" data-calendar-campus={c.campusId}>
                  <CalendarIdentityCell
                    calendar={c}
                    badge={<CalendarStatusBadge status={c.status} />}
                    withOrigin
                  />
                  <div className="calendar-list-authorship">
                    <small>Criado por: {c.createdByName || 'Autoria não registrada'}</small>
                    <small>
                      Última alteração por: {c.updatedByName || 'Autoria não registrada'} ·{' '}
                      {updatedLabel(c.updatedAt)}
                    </small>
                  </div>
                  {actions(c)}
                </li>
              ))}
              {!calendars.length && !loading ? (
                <li className="calendar-list-empty">{empty}</li>
              ) : null}
            </ul>
          </div>
        )}
        <Pagination
          pagination={pagination}
          label="Carregar mais calendários"
          loadingLabel="Carregando calendários…"
        />
      </CollectionPanel>
    </section>
  );
}
