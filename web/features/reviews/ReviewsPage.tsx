import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { usePaginatedQuery, useQuery } from 'convex/react';
import {
  reviewEditable,
  statusLabels,
  type CalendarStatus,
} from '#src/domain/calendar/lifecycle.ts';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { useAppSession } from '../../app/session.tsx';
import CampusFilter from '../calendar-list/CampusFilter.tsx';
import { useSelectedCampus } from '../calendar-list/selected-campus.ts';
import ReviewQueue from './ReviewQueue.tsx';
import './reviews.css';

type QueueStatus = Exclude<CalendarStatus, 'rascunho'>;

/** The reviewer works by status; drafts never reach the queue. */
const statusTabs = [
  ['enviado', 'Aguardando análise'],
  ['em_revisao', 'Em análise'],
  ['revisado', 'Concluídos'],
  ['devolvido', 'Devolvidos'],
  ['vigente', 'Vigentes'],
  ['arquivado', 'Arquivados'],
] as const satisfies readonly (readonly [QueueStatus, string])[];

/** "Meus pareceres" gathers the person's pareceres of every situation, before the status tabs. */
const tabs = [['meus', 'Meus pareceres'], ...statusTabs] as const;
type Tab = (typeof tabs)[number][0];

const statusTabLabel = Object.fromEntries(statusTabs) as Record<QueueStatus, string>;

export default function ReviewsPage() {
  const { info } = useAppSession();
  const route = useFeatureRoute();
  const { aba } = useSearch({ strict: false });
  const campus = useSelectedCampus();
  const navigate = useNavigate();
  const mine = aba === 'meus';
  // A situation the queue does not list, such as a draft, falls back to the default tab.
  const status = statusTabs.find(([value]) => value === route.situacao)?.[0] ?? 'enviado';
  const selected: Tab = mine ? 'meus' : status;
  // Only a parecer still open has a holder, so the other tabs have nothing to filter by.
  const responsavel = !mine && reviewEditable(status) ? route.responsavel : undefined;
  const filters = mine
    ? { campus: campus?.id, aba: 'meus' as const }
    : {
        campus: campus?.id,
        situacao: status === 'enviado' ? undefined : status,
        responsavel,
      };
  const [error, setError] = useState('');
  const pagination = usePaginatedQuery(
    functions.reviews.reviewQueue,
    mine
      ? 'skip'
      : ({
          status,
          ...(campus ? { campusId: campus.id } : {}),
          ...(responsavel ? { holder: responsavel === 'meus' ? 'mine' : 'none' } : {}),
        } as const),
    { initialNumItems: 50 },
  );
  const counts = useQuery(functions.reviews.reviewQueueCounts, {
    ...(campus ? { campusId: campus.id } : {}),
    ...(responsavel ? { holder: responsavel === 'meus' ? 'mine' : 'none' } : {}),
  } as const);
  const myGroups = useQuery(
    functions.reviews.myReviews,
    mine ? (campus ? { campusId: campus.id } : {}) : 'skip',
  );
  function select(next: Tab) {
    setError('');
    void navigate({
      to: '/revisoes',
      search:
        next === 'meus'
          ? { campus: campus?.id, aba: 'meus' }
          : {
              campus: campus?.id,
              situacao: next === 'enviado' ? undefined : next,
              responsavel: reviewEditable(next) ? route.responsavel : undefined,
            },
      replace: true,
    });
  }
  return (
    <section id="review-panel" className="page">
      <div className="panel">
        <div
          className="ui-tabs review-tabs"
          role="tablist"
          aria-label="Situação dos calendários"
          onKeyDown={(event) => {
            // Only the selected tab is in the tab order; the arrows move between tabs. The URL
            // updates asynchronously, so a quick second press starts from the focused tab.
            const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            const focused = (event.target as HTMLElement).id;
            const index = tabs.findIndex(([value]) => `review-tab-${value}` === focused);
            const next = tabs[(index + step + tabs.length) % tabs.length][0];
            select(next);
            document.getElementById(`review-tab-${next}`)?.focus();
          }}
        >
          {tabs.map(([value, label]) => {
            // The holder filter narrows the counts; "Meus pareceres" has no count of its own.
            const waiting = value === 'enviado' || value === 'em_revisao' ? counts?.[value] : null;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                id={`review-tab-${value}`}
                tabIndex={selected === value ? 0 : -1}
                aria-selected={selected === value}
                aria-controls="review-queue-panel"
                onClick={() => select(value)}
              >
                {/* Reserves the bold width, so selecting a tab does not move its neighbors. */}
                <span className="ui-tab-label" data-label={label}>
                  {label}
                </span>
                {waiting?.count ? (
                  <span className="review-tab-count" data-queue-count={value}>
                    {waiting.more ? `${waiting.count}+` : waiting.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div id="review-queue-panel" role="tabpanel" aria-labelledby={`review-tab-${selected}`}>
          <div className="calendar-list-tools review-queue-tools">
            <CampusFilter
              campuses={info.campuses}
              value={campus?.id ?? ''}
              onChange={(id) => {
                void navigate({
                  to: '/revisoes',
                  search: { ...filters, campus: id || undefined },
                  replace: true,
                });
              }}
            />
            {!mine && reviewEditable(status) ? (
              <label>
                Filtrar por responsável
                <select
                  id="review-holder-filter"
                  value={responsavel ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    void navigate({
                      to: '/revisoes',
                      search: {
                        ...filters,
                        responsavel: value === 'meus' || value === 'livres' ? value : undefined,
                      },
                      replace: true,
                    });
                  }}
                >
                  <option value="">Todos</option>
                  <option value="meus">Meus pareceres</option>
                  <option value="livres">Sem responsável</option>
                </select>
              </label>
            ) : null}
          </div>
          <p className="review-queue-note">
            A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI.
          </p>
          {mine ? (
            <>
              {myGroups === undefined ? (
                <LoadingIndicator label="Carregando seus pareceres…" />
              ) : null}
              {myGroups?.map((group) => (
                <section
                  key={group.status}
                  className="review-my-group"
                  aria-labelledby={`review-my-${group.status}`}
                  data-my-reviews={group.status}
                >
                  <h2 id={`review-my-${group.status}`} className="review-my-heading">
                    {statusTabLabel[group.status]}
                    <span className="review-tab-count">
                      {group.more ? `${group.items.length}+` : group.items.length}
                    </span>
                  </h2>
                  <ReviewQueue
                    id={`review-calendars-${group.status}`}
                    items={group.items}
                    filters={filters}
                    userId={info.user.id}
                    onError={setError}
                  />
                  {group.more ? (
                    <p className="review-queue-note">
                      Mostrando os {group.items.length} mais recentes desta situação.
                    </p>
                  ) : null}
                </section>
              ))}
            </>
          ) : (
            <>
              <ReviewQueue
                items={pagination.results}
                filters={filters}
                userId={info.user.id}
                onError={setError}
              />
              <Pagination
                pagination={pagination}
                label="Carregar mais calendários"
                loadingLabel="Carregando calendários para revisão…"
              />
            </>
          )}
          <div id="review-message" role="status" aria-live="polite">
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {mine && myGroups?.length === 0 ? (
              <Notice tone="info">
                Nenhum parecer com você{campus ? ' neste campus' : ''} no momento.
              </Notice>
            ) : null}
            {!mine && !pagination.results.length && pagination.status === 'Exhausted' ? (
              <Notice tone="info">
                Nenhum calendário {statusLabels[status].toLowerCase()}
                {campus ? ' neste campus' : ''}
                {responsavel ? ' com este responsável' : ''} no momento.
              </Notice>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
