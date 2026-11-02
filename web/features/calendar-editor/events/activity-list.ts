import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { activityStatus, type ActivityStatus } from '#src/domain/calendar/activities/status.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { useActivitySearch } from './activity-query.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

// What still needs dates or a decision; everything else has no pending item.
const toFill: ActivityStatus[] = ['pending', 'partial', 'unconfigured'];

export const activityViews = [
  ['', 'Todas'],
  ['preencher', 'A preencher'],
  ['sem-pendencias', 'Sem pendências'],
] as const;

function searchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

/**
 * The activities step 5 lists and how many each view holds. Filters narrow the candidates by
 * the same status the row badge shows; the view then splits them without hiding anything else.
 */
export function useActivityList(stages = false) {
  const { state } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const { coverage } = useActivityCoverage();
  const selected =
    editor.context?.kind === 'activity'
      ? editor.context.requirementId
      : editor.panel?.kind === 'activity'
        ? editor.panel.requirementId
        : '';
  // Only the offers being consulted decide an activity's status.
  const consulted = (id: string) =>
    coverage.filter(
      (row) =>
        row.requirement.id === id &&
        (!search.atividadeOferta || row.offerId === search.atividadeOferta),
    );
  const statusOf = (id: string) => activityStatus(consulted(id));
  const pinned = (id: string) => selected === id || search.atividade === id;
  const query = searchText(search.atividadeBusca ?? '');
  const candidates = activityChecklist(state).filter((item) => {
    if ((item.variant === 'stage') !== stages) return false;
    if (stages || pinned(item.id)) return true;
    if (!consulted(item.id).length) return false;
    if (query && !searchText(`${item.name} ${item.basis ?? ''}`).includes(query)) return false;
    if (search.atividadeAssunto && item.group !== search.atividadeAssunto) return false;
    if (search.atividadeSituacao && statusOf(item.id).status !== search.atividadeSituacao)
      return false;
    return true;
  });
  const pending = (id: string) => {
    const summary = statusOf(id);
    return toFill.includes(summary.status) || summary.problems;
  };
  const fill = candidates.filter((item) => pending(item.id)).length;
  const counts = {
    '': candidates.length,
    preencher: fill,
    'sem-pendencias': candidates.length - fill,
  };
  const view = search.atividadeVisao;
  const rows = candidates.filter(
    (item) => stages || !view || pinned(item.id) || (view === 'preencher') === pending(item.id),
  );
  return { rows, counts, selected };
}
