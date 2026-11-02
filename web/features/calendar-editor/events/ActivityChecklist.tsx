import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { activityPlan } from '#src/domain/calendar/activities/plan.ts';
import { stageRequirement } from '#src/domain/calendar/activities/assessment.ts';
import { activityKey, isAssessmentStage } from '#src/domain/calendar/activities/activity-ref.ts';
import { linkIssueLabels, linksToReview } from '#src/domain/calendar/activities/links.ts';
import { activityStatusLabels } from '#src/domain/calendar/activities/status.ts';
import { observanceForEvent } from '#src/domain/calendar/observances.ts';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { useActivityList } from './activity-list.ts';
import type { ActivityLine, DateLine } from './activity-step.ts';
import { activityGroups, civilDate, useActivitySearch } from './activity-query.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import ActivityRow from './ActivityRow.tsx';

const range = (event: { start: string; end: string }) =>
  `${civilDate(event.start)} a ${civilDate(event.end)}`;
const monthLabel = (date: string) =>
  new Date(`${date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function ActivityChecklist() {
  const { state, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  const { coverage, statusFor } = useActivityCoverage();
  const list = useActivityList();
  const { selected, view: mode } = list;
  const { view, viewEvent } = editor;
  // Assessment intervals answer their links in the assessment area, not here.
  const linked = activityPlan(state).find(
    (item) => item.id === search.atividade && item.variant !== 'stage',
  )?.id;
  // A review link may also name the recorded link of a date under “Vínculo a conferir”.
  const review = linksToReview(state);
  const linkedDate =
    linked || stageRequirement(search.atividade)
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
    (row) => row.applicability === 'required' && !stageRequirement(row.requirement.id),
  );

  const renderActivity = ({ item, status, dates }: ActivityLine) => (
    <li key={item.id} data-activity-row={item.id} data-status={status.status}>
      <ActivityRow
        id={`activity-${item.id}`}
        data-activity-open={item.id}
        label={item.name}
        status={status.status}
        selected={selected === item.id}
        dates={
          dates.length
            ? `${range(dates[0])}${dates.length > 1 ? ` (+${dates.length - 1})` : ''}`
            : 'Sem datas'
        }
        onClick={() =>
          dates.length || readOnly || (editor.context && editor.dirty)
            ? view(item.id)
            : editor.prepare(item.id)
        }
      />
    </li>
  );
  const renderDate = (line: DateLine) => {
    const { event, origin, activity, issue } = line;
    const observance = observanceForEvent(state.year, event.id);
    const planned = event.notice?.publication === 'planned';
    const activityStatus = activity ? statusFor(activity.id).status : undefined;
    const statusLabel = issue
      ? linkIssueLabels[issue]
      : origin === 'base'
        ? observance
          ? 'Data ajustável'
          : 'Base institucional'
        : activityStatus
          ? activityStatusLabels[activityStatus]
          : planned
            ? 'Publicação programada'
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
              : (activityStatus ?? (origin === 'base' ? 'optional' : 'complete'))
          }
          statusLabel={statusLabel}
          dates={range(event)}
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
            (activity !== undefined && selected === activity.id)
          }
          onClick={() => {
            if (observance) editor.viewObservance(observance.key);
            // Assessment intervals are edited in their own area; one under review opens its
            // details, where it can be removed or have its dates adjusted.
            else if (isAssessmentStage(event.activity) && !event.institutional && !issue)
              editor.edit(event.id);
            else if (activity) view(activity.id);
            else editor.viewEvent(event.id);
          }}
        />
      </li>
    );
  };
  // Collapsed by default; an action that shows one of its dates opens it, and it stays open.
  const [baseExpanded, setBaseExpanded] = useState(false);
  const baseOpen =
    baseExpanded ||
    search.atividadeOrigem === 'base' ||
    list.base.some(
      (line) =>
        line.event.id === panelEvent ||
        observanceForEvent(state.year, line.event.id)?.key === panelObservance,
    );
  const empty =
    !list.adjustable.length &&
    (mode === 'data'
      ? !list.dates.length
      : !list.activities.length && !list.review.length && !list.campus.length && !list.base.length);

  return (
    <>
      {list.adjustable.length > 0 && (
        <section
          id="adjustable-dates"
          className="activity-group"
          aria-labelledby="group-adjustable"
        >
          <h4 id="group-adjustable">Datas ajustáveis a resolver ({list.adjustable.length})</h4>
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
        </section>
      )}
      {mode === 'atividade' ? (
        <>
          <ul id="activity-summary" className="activity-summary" role="status">
            {offerIds(state).map((modality) => {
              const required = mandatory.filter((row) => row.offerId === modality);
              const fulfilled = required.filter((row) => row.coverage === 'complete').length;
              const unconfigured = coverage.filter(
                (row) =>
                  row.offerId === modality &&
                  row.applicability === 'unconfigured' &&
                  !stageRequirement(row.requirement.id),
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
          <div id="activity-checklist">
            {activityGroups.map(([group, label]) => {
              const items = list.activities.filter((line) => line.item.group === group);
              return items.length ? (
                <section key={group} className="activity-group" aria-labelledby={`group-${group}`}>
                  <h4 id={`group-${group}`}>
                    {label} ({items.length})
                  </h4>
                  <ul className="activity-rows">{items.map(renderActivity)}</ul>
                </section>
              ) : null;
            })}
            {list.review.length > 0 && (
              <section id="link-review" className="activity-group" aria-labelledby="group-review">
                <h4 id="group-review">Vínculo a conferir ({list.review.length})</h4>
                <p className="help">
                  Datas cujo vínculo gravado não conta como atendimento na organização atual. O
                  vínculo é preservado; ajuste a organização, as datas ou exclua a data.
                </p>
                <ul className="activity-rows">{list.review.map(renderDate)}</ul>
              </section>
            )}
            {list.campus.length > 0 && (
              <section id="campus-dates" className="activity-group" aria-labelledby="group-campus">
                <h4 id="group-campus">Datas do campus ({list.campus.length})</h4>
                <ul id="event-list" className="activity-rows">
                  {list.campus.map(renderDate)}
                </ul>
              </section>
            )}
            {list.base.length > 0 && (
              <details
                id="base-dates"
                className="activity-group activity-base"
                open={baseOpen || undefined}
                onToggle={(event) => setBaseExpanded(event.currentTarget.open)}
              >
                <summary>
                  <h4>Datas da base institucional ({list.base.length})</h4>
                </summary>
                <ul className="activity-rows">{list.base.map(renderDate)}</ul>
              </details>
            )}
          </div>
        </>
      ) : (
        <div id="date-list">
          {list.withoutDates > 0 && (
            <Notice
              tone="info"
              id="activities-without-dates"
              actions={
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    void navigate({
                      to: '.',
                      search: (previous) => ({ ...previous, atividadeVisao: undefined }),
                      hashScrollIntoView: false,
                    })
                  }
                >
                  Ver por atividade
                </button>
              }
            >
              {list.withoutDates === 1
                ? '1 atividade sem datas a preencher não aparece nesta visão.'
                : `${list.withoutDates} atividades sem datas a preencher não aparecem nesta visão.`}
            </Notice>
          )}
          {[...new Set(list.dates.map((line) => line.event.start.slice(0, 7)))].map((month) => {
            const lines = list.dates.filter((line) => line.event.start.startsWith(month));
            return (
              <section key={month} className="activity-group" aria-labelledby={`month-${month}`}>
                <h4 id={`month-${month}`}>
                  {monthLabel(month)} ({lines.length})
                </h4>
                <ul className="activity-rows">{lines.map(renderDate)}</ul>
              </section>
            );
          })}
        </div>
      )}
      {!linked && !linkedDate && search.atividade && !stageRequirement(search.atividade) && (
        <Notice tone="warning" id="activity-link-missing">
          A atividade indicada no link não existe na organização atual deste calendário.
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
