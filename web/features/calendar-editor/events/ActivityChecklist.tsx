import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { stageRequirement } from '#src/domain/calendar/activities/assessment.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { activityStatus, type ActivityStatus } from '#src/domain/calendar/activities/status.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { activityGroups, civilDate, useActivitySearch } from './activity-query.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import ActivityRow from './ActivityRow.tsx';

// Shown when no status filter is chosen: what still needs dates or a decision.
const toFill: ActivityStatus[] = ['pending', 'partial', 'unconfigured'];

function searchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export default function ActivityChecklist({ stages = false }: { stages?: boolean }) {
  const { state, readOnly, record } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  const { coverage, statusFor } = useActivityCoverage();
  const selected =
    editor.context?.kind === 'activity'
      ? editor.context.requirementId
      : editor.panel?.kind === 'activity'
        ? editor.panel.requirementId
        : '';
  const { view } = editor;
  const linked = activityChecklist(state).find(
    (item) => item.id === search.atividade && (item.variant === 'stage') === stages,
  )?.id;
  useEffect(() => {
    if (!linked) return;
    const frame = requestAnimationFrame(() => {
      scrollIntoView(document.getElementById(`activity-${linked}`), { block: 'center' });
      // A review link shows the activity's details right away, in step 3 or step 6.
      view(linked);
    });
    return () => cancelAnimationFrame(frame);
  }, [linked, view]);
  const mandatory = coverage.filter(
    (row) => row.applicability === 'required' && !stageRequirement(row.requirement.id),
  );
  const situation = search.atividadeSituacao ?? '';
  const query = searchText(search.atividadeBusca ?? '');
  const candidates = activityChecklist(state).filter((item) => {
    if ((item.variant === 'stage') !== stages) return false;
    if (stages || selected === item.id || search.atividade === item.id) return true;
    const matches = coverage.filter(
      (row) =>
        row.requirement.id === item.id &&
        (!search.atividadeOferta || row.modality === search.atividadeOferta),
    );
    if (!matches.length) return false;
    if (query && !searchText(`${item.name} ${item.basis ?? ''}`).includes(query)) return false;
    if (search.atividadeAssunto && item.group !== search.atividadeAssunto) return false;
    if (
      situation &&
      situation !== 'all' &&
      !matches.some((row) => situation === row.coverage || situation === row.applicability)
    )
      return false;
    return true;
  });
  const rows = candidates.filter((item) => {
    if (stages || situation || selected === item.id || search.atividade === item.id) return true;
    // Only the offers being consulted decide whether something is left to fill.
    const summary = activityStatus(
      coverage.filter(
        (row) =>
          row.requirement.id === item.id &&
          (!search.atividadeOferta || row.modality === search.atividadeOferta),
      ),
    );
    return toFill.includes(summary.status) || summary.problems;
  });
  const hidden = candidates.length - rows.length;
  const renderRow = (item: ReturnType<typeof activityChecklist>[number]) => {
    const registered = state.events
      .filter((event) => event.requirementId === item.id)
      .sort((a, b) => a.start.localeCompare(b.start));
    const summary = statusFor(item.id);
    return (
      <li key={item.id} data-activity-row={item.id} data-status={summary.status}>
        <ActivityRow
          id={`activity-${item.id}`}
          data-activity-open={item.id}
          label={item.name}
          status={summary.status}
          selected={selected === item.id}
          dates={
            registered.length
              ? `${civilDate(registered[0].start)} a ${civilDate(registered[0].end)}${registered.length > 1 ? ` (+${registered.length - 1})` : ''}`
              : 'Sem datas'
          }
          onClick={() =>
            registered.length || readOnly || (editor.context && editor.dirty)
              ? editor.view(item.id)
              : editor.prepare(item.id)
          }
        />
      </li>
    );
  };
  return (
    <>
      {!stages && (
        <ul id="activity-summary" className="activity-summary" role="status">
          {state.modalities.map((modality) => {
            const required = mandatory.filter((row) => row.modality === modality);
            const fulfilled = required.filter((row) => row.coverage === 'complete').length;
            const unconfigured = coverage.filter(
              (row) =>
                row.modality === modality &&
                row.applicability === 'unconfigured' &&
                !stageRequirement(row.requirement.id),
            ).length;
            return (
              <li key={modality}>
                <span>
                  <strong>{modalityLabels[modality]}:</strong> {fulfilled} de {required.length}{' '}
                  atividades obrigatórias com planejamento completo
                  {unconfigured ? ` · ${unconfigured} com aplicação a confirmar` : ''}.
                </span>
                <progress
                  value={fulfilled}
                  max={Math.max(required.length, 1)}
                  aria-label={`Progresso de ${modalityLabels[modality]}`}
                />
              </li>
            );
          })}
        </ul>
      )}
      {!rows.length && (
        <Notice tone="info" id="activity-empty">
          {hidden
            ? 'Nenhuma atividade a preencher com estes filtros.'
            : 'Nenhuma atividade corresponde aos filtros.'}{' '}
          O preenchimento em andamento foi preservado.
        </Notice>
      )}
      {stages ? (
        <div id="assessment-checklist">
          {state.modalities.map((modality) => {
            const items = rows.filter((item) => !item.modality || item.modality === modality);
            return items.length ? (
              <section
                key={modality}
                className="activity-group"
                aria-label={`Avaliações — ${modalityLabels[modality]}`}
              >
                <h4>{modalityLabels[modality]}</h4>
                <ul className="activity-rows">{items.map(renderRow)}</ul>
              </section>
            ) : null;
          })}
        </div>
      ) : (
        <div id="activity-checklist">
          {activityGroups.map(([group, label]) => {
            const items = rows.filter((item) => item.group === group);
            return items.length ? (
              <section key={group} className="activity-group" aria-labelledby={`group-${group}`}>
                <h4 id={`group-${group}`}>
                  {label} ({items.length})
                </h4>
                <ul className="activity-rows">{items.map(renderRow)}</ul>
              </section>
            ) : null;
          })}
          {hidden > 0 && (
            <p id="activity-hidden" className="help">
              {hidden === 1
                ? '1 atividade completa ou opcional não exibida.'
                : `${hidden} atividades completas ou opcionais não exibidas.`}{' '}
              <button
                type="button"
                id="show-all-activities"
                className="link-button"
                onClick={() => {
                  void navigate({
                    to: '/calendarios/$calendarId/eventos',
                    params: { calendarId: record.id },
                    search: (previous) => ({ ...previous, atividadeSituacao: 'all' }),
                    hashScrollIntoView: false,
                  });
                }}
              >
                Mostrar todas
              </button>
            </p>
          )}
        </div>
      )}
    </>
  );
}
