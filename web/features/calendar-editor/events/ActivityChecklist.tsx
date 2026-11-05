import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { activityKey, isAssessmentStage } from '#src/domain/calendar/activities/activity-ref.ts';
import {
  generatedActivities,
  linkIssueLabels,
  linksToReview,
} from '#src/domain/calendar/activities/links.ts';
import {
  executionLabels,
  situationLabels,
} from '#src/domain/calendar/activities/plan-evaluation.ts';
import { observanceForEvent } from '#src/domain/calendar/observances.ts';
import { isInternalDate } from '#src/domain/calendar/internal-dates.ts';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { useActivityList } from './activity-list.ts';
import type { ActivityLine, DateLine } from './activity-step.ts';
import { activityGroups, useActivitySearch } from './activity-query.ts';
import { compactRange } from '#src/domain/date-labels.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import ActivityRow from './ActivityRow.tsx';
import ActivityGroup from './ActivityGroup.tsx';

/** Moves the focus once the step has rendered the URL a notice action navigated to. */
const focusAfterRender = (target: () => HTMLElement | null) =>
  requestAnimationFrame(() => target()?.focus());
const monthLabel = (date: string) =>
  new Date(`${date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function ActivityChecklist() {
  const { state, readOnly } = useCalendarEditor();
  const range = (event: { start: string; end: string }) => compactRange(event, state.year);
  const editor = useEventEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  const { coverage, statusFor } = useActivityCoverage();
  const list = useActivityList();
  const { selected, view: mode } = list;
  const { view, viewEvent } = editor;
  // A review link names an activity by the complete key of its link, validated by the Router.
  // Assessment intervals answer their links in the assessment area, not here.
  const generated = search.atividade ? generatedActivities(state).get(search.atividade) : undefined;
  const assessmentStage = generated?.variant === 'stage';
  const linked = generated && !assessmentStage ? search.atividade : undefined;
  // A review link may also name the recorded link of a date under “Vínculo a conferir”.
  const review = linksToReview(state);
  const linkedDate = linked
    ? undefined
    : state.events.find(
        (event) =>
          event.activity &&
          activityKey(event.activity) === search.atividade &&
          review.has(event.id),
      )?.id;
  // A link to an activity opens the by-activity view, even from a by-date URL.
  useEffect(() => {
    if (linked && mode === 'data')
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, atividadeVisao: undefined }),
        replace: true,
        hashScrollIntoView: false,
      });
  }, [linked, mode, navigate]);
  useEffect(() => {
    if (!linked && !linkedDate) return;
    const frame = requestAnimationFrame(() => {
      const id = linked ? `activity-${linked}` : `date-${linkedDate}`;
      scrollIntoView(document.getElementById(id), { block: 'center' });
      // A review link shows its details right away.
      if (linked) view(linked);
      else if (linkedDate) viewEvent(linkedDate);
    });
    return () => cancelAnimationFrame(frame);
  }, [linked, linkedDate, view, viewEvent]);
  const panelEvent =
    editor.open && editor.context?.kind === 'event'
      ? editor.eventId
      : editor.panel?.kind === 'event'
        ? editor.panel.eventId
        : undefined;
  const panelObservance = editor.panel?.kind === 'observance' ? editor.panel.key : undefined;
  const mandatory = coverage.filter(
    (row) => row.applicability === 'required' && !isAssessmentStage(row.requirement.activity),
  );

  const renderActivity = ({ key, item, status, dates }: ActivityLine) => (
    <li key={key} data-activity-row={key} data-status={status.status}>
      <ActivityRow
        id={`activity-${key}`}
        data-activity-open={key}
        label={item.name}
        status={status.status}
        selected={selected === key}
        dates={
          dates.length
            ? `${range(dates[0])}${dates.length > 1 ? ` (+${dates.length - 1})` : ''}`
            : 'Sem datas'
        }
        onClick={() =>
          dates.length || readOnly || (editor.context && editor.dirty)
            ? view(key)
            : editor.prepare(key)
        }
      />
    </li>
  );
  const renderDate = (line: DateLine) => {
    const { event, origin, activity, issue } = line;
    const observance = observanceForEvent(state.year, event.id);
    const planned = event.notice?.publication === 'planned';
    const key = activity && activityKey(activity.activity);
    const situation = key ? statusFor(key).status : undefined;
    const statusLabel = issue
      ? linkIssueLabels[issue]
      : origin === 'base'
        ? observance
          ? 'Data ajustável'
          : 'Base institucional'
        : situation
          ? situationLabels[situation]
          : planned
            ? executionLabels.planned
            : 'Data do campus';
    return (
      <li key={event.id} data-date-row={event.id} data-origin={origin}>
        <ActivityRow
          id={observance ? `open-observance-${observance.key}` : `date-${event.id}`}
          data-open-event={event.id}
          data-observance={observance?.key}
          label={event.name}
          status={
            issue || planned
              ? 'pending'
              : (situation ?? (origin === 'base' ? 'optional' : 'complete'))
          }
          statusLabel={statusLabel}
          tone={!issue && origin !== 'base' && !situation && !planned ? 'info' : undefined}
          dates={range(event)}
          category={event}
          pendingDraft={editor.pendingDates.has(event.id)}
          internal={isInternalDate(event)}
          note={
            issue
              ? `Vínculo gravado: ${event.activity && activityKey(event.activity)}`
              : activity
                ? `Atividade: ${activity.name}`
                : undefined
          }
          selected={
            panelEvent === event.id ||
            (panelObservance !== undefined && observance?.key === panelObservance) ||
            (key !== undefined && selected === key)
          }
          onClick={() => {
            if (observance) editor.viewObservance(observance.key);
            // Assessment intervals are edited in their own area; one under review opens its
            // details, where it can be removed or have its dates adjusted.
            else if (isAssessmentStage(event.activity) && !event.institutional && !issue)
              editor.edit(event.id);
            else if (key) view(key);
            else editor.viewEvent(event.id);
          }}
        />
      </li>
    );
  };
  // A search or filter opens every group; collapsing under it lasts until the next one.
  const filters = [
    search.atividadeBusca,
    search.atividadePendencia,
    search.atividadeSituacao,
    search.atividadeOrigem,
    search.atividadeVisibilidade,
    search.atividadeOferta,
    search.atividadeAssunto,
  ];
  const filtered = filters.some(Boolean) ? filters.join('|') : '';
  // A group holding the row in the panel or named by the link opens to show it.
  const holdsActivity = (lines: ActivityLine[]) =>
    lines.some((line) => line.key === selected || line.key === linked);
  const holdsDate = (lines: DateLine[]) =>
    lines.some(
      ({ event, activity }) =>
        event.id === panelEvent ||
        event.id === linkedDate ||
        (panelObservance !== undefined &&
          observanceForEvent(state.year, event.id)?.key === panelObservance) ||
        (activity !== undefined && activityKey(activity.activity) === selected),
    );
  const pendingIn = (lines: { pending: boolean }[]) => lines.filter((line) => line.pending).length;
  const empty =
    !list.adjustable.length &&
    (mode === 'data'
      ? !list.dates.length
      : !list.activities.length && !list.review.length && !list.campus.length && !list.base.length);

  return (
    <>
      {/* The step's measure by offer, the same in both views and under any filter. */}
      <ul id="activity-summary" className="activity-summary" role="status">
        {offerIds(state).map((modality) => {
          const required = mandatory.filter((row) => row.offerId === modality);
          const fulfilled = required.filter((row) => row.coverage === 'complete').length;
          const unconfigured = coverage.filter(
            (row) =>
              row.offerId === modality &&
              row.applicability === 'unconfigured' &&
              !isAssessmentStage(row.requirement.activity),
          ).length;
          return (
            <li key={modality}>
              <span>
                <strong>{labelFor(state, modality)}:</strong> {fulfilled} de {required.length}{' '}
                atividades obrigatórias com planejamento completo
                {unconfigured ? ` · ${unconfigured} com aplicação a confirmar` : ''}.
              </span>
              <progress
                value={fulfilled}
                max={Math.max(required.length, 1)}
                aria-label={`Progresso de ${labelFor(state, modality)}`}
              />
            </li>
          );
        })}
      </ul>
      {list.activitiesHidden && (
        <Notice
          tone="info"
          id="activities-hidden-by-visibility"
          actions={
            <button
              type="button"
              className="link-button"
              onClick={() =>
                void navigate({
                  to: '.',
                  search: (previous) => ({ ...previous, atividadeVisibilidade: undefined }),
                  hashScrollIntoView: false,
                }).then(() =>
                  // The notice leaves with its button: focus returns to the filter it cleared, or
                  // to “Mais filtros” when no other filter keeps that group open.
                  focusAfterRender(() => {
                    const select = document.getElementById('activity-visibility');
                    return select?.checkVisibility()
                      ? select
                      : document.querySelector<HTMLElement>('.activity-more-filters > summary');
                  }),
                )
              }
            >
              Mostrar todas as datas
            </button>
          }
        >
          As atividades estão ocultas pelo filtro Visibilidade: Internas. A lista mostra só as datas
          internas do campus.
        </Notice>
      )}
      {list.adjustable.length > 0 && (
        <ActivityGroup
          id="adjustable-dates"
          headingId="group-adjustable"
          title="Datas ajustáveis a resolver"
          count={list.adjustable.length}
          fixed
        >
          <ul className="activity-rows">
            {list.adjustable.map((line) => (
              <li key={line.key} data-adjustable={line.key}>
                <ActivityRow
                  id={`open-observance-${line.key}`}
                  data-observance={line.key}
                  label={line.label}
                  status="pending"
                  statusLabel="A resolver"
                  dates={line.messages.join(' ')}
                  selected={panelObservance === line.key}
                  onClick={() => editor.viewObservance(line.key)}
                />
              </li>
            ))}
          </ul>
        </ActivityGroup>
      )}
      {mode === 'atividade' ? (
        <div id="activity-checklist">
          {activityGroups.map(([group, label]) => {
            const items = list.activities.filter((line) => line.item.group === group);
            return items.length ? (
              <ActivityGroup
                key={group}
                headingId={`group-${group}`}
                title={label}
                count={items.length}
                pending={pendingIn(items)}
                filtering={filtered}
                pinned={holdsActivity(items)}
              >
                <ul className="activity-rows">{items.map(renderActivity)}</ul>
              </ActivityGroup>
            ) : null;
          })}
          {list.review.length > 0 && (
            <ActivityGroup
              id="link-review"
              headingId="group-review"
              title="Vínculo a conferir"
              count={list.review.length}
              fixed
            >
              <p className="help">
                Datas cujo vínculo gravado não conta como atendimento na organização atual. O
                vínculo é preservado; corrija a atividade vinculada no detalhe da data, ajuste a
                organização ou as datas, ou exclua a data. Enquanto houver datas aqui, a conferência
                aponta pendência e o calendário não pode ser publicado.
              </p>
              <ul className="activity-rows">{list.review.map(renderDate)}</ul>
            </ActivityGroup>
          )}
          {list.campus.length > 0 && (
            <ActivityGroup
              id="campus-dates"
              headingId="group-campus"
              title="Datas do campus"
              count={list.campus.length}
              pending={pendingIn(list.campus)}
              filtering={filtered}
              pinned={holdsDate(list.campus)}
            >
              <ul id="event-list" className="activity-rows">
                {list.campus.map(renderDate)}
              </ul>
            </ActivityGroup>
          )}
          {list.base.length > 0 && (
            <ActivityGroup
              id="base-dates"
              headingId="group-base"
              title="Datas da base institucional"
              count={list.base.length}
              pending={pendingIn(list.base)}
              collapsed
              filtering={filtered}
              pinned={holdsDate(list.base)}
            >
              <ul className="activity-rows">{list.base.map(renderDate)}</ul>
            </ActivityGroup>
          )}
        </div>
      ) : (
        <div id="date-list">
          {[...new Set(list.dates.map((line) => line.event.start.slice(0, 7)))].map((month) => {
            const lines = list.dates.filter((line) => line.event.start.startsWith(month));
            return (
              <ActivityGroup
                key={month}
                headingId={`month-${month}`}
                title={monthLabel(month)}
                count={lines.length}
                pending={pendingIn(lines)}
                filtering={filtered}
                pinned={holdsDate(lines)}
              >
                <ul className="activity-rows">{lines.map(renderDate)}</ul>
              </ActivityGroup>
            );
          })}
        </div>
      )}
      {!linked && !linkedDate && search.atividade && !assessmentStage && (
        <Notice tone="warning" id="activity-link-missing">
          A atividade indicada no link não existe na organização atual deste calendário.
        </Notice>
      )}
      {search.atividadeInvalida && (
        <Notice tone="warning" id="activity-link-invalid">
          O link não indica uma atividade reconhecida. Ele pode ser anterior à atualização de
          atividades e datas; abra a atividade pela lista.
        </Notice>
      )}
      {empty && (
        <Notice tone="info" id="activity-empty">
          Nenhum item corresponde aos filtros. O preenchimento em andamento foi preservado.
        </Notice>
      )}
    </>
  );
}
