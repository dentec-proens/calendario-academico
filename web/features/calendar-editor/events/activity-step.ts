import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import type { activityCoverage } from '#src/domain/calendar/activities/coverage.ts';
import { linksToReview, type LinkIssue } from '#src/domain/calendar/activities/links.ts';
import { activityStatus, type ActivityStatus } from '#src/domain/calendar/activities/status.ts';
import { appliesTo } from '#src/domain/calendar/modalities.ts';
import { calendarObservances, observanceIssues } from '#src/domain/calendar/observances.ts';
import { offerFor } from '#src/domain/calendar/offers.ts';
import type { ActivityRequirement } from '#src/domain/calendar/model.ts';
import type { applicationSearch } from '../../../app/search.ts';
import type { CalendarState, EditorEvent } from '../types.ts';

export type ActivityView = 'atividade' | 'data';
export type Pendency = '' | 'preencher' | 'sem-pendencias';
/** Where a date comes from: computed from its container and link, never stored. */
export type DateOrigin = 'linked' | 'campus' | 'base';
type Search = ReturnType<typeof applicationSearch>;

export const activityViews = [
  ['atividade', 'Por atividade'],
  ['data', 'Por data'],
] as const;
export const pendencyFilters = [
  ['', 'Todas'],
  ['preencher', 'A preencher'],
  ['sem-pendencias', 'Sem pendências'],
] as const;
export const originFilters = [
  ['', 'Todas as origens'],
  ['vinculadas', 'Vinculadas a atividades'],
  ['campus', 'Do campus'],
  ['base', 'Base institucional'],
] as const;
const originOf = { vinculadas: 'linked', campus: 'campus', base: 'base' } as const;

// What still needs dates or a decision; everything else has no pending item.
const toFill: ActivityStatus[] = ['pending', 'partial', 'unconfigured'];

export interface ActivityLine {
  item: ActivityRequirement;
  status: ReturnType<typeof activityStatus>;
  pending: boolean;
  dates: EditorEvent[];
}
export interface DateLine {
  event: EditorEvent;
  origin: DateOrigin;
  /** Generated activity the date fulfils, unless its link is under review. */
  activity?: ActivityRequirement;
  issue?: LinkIssue;
  pending: boolean;
}
export interface AdjustableLine {
  key: string;
  label: string;
  messages: string[];
}

export function searchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function dateOrigin(
  event: Pick<EditorEvent, 'institutional' | 'requirementId'>,
): DateOrigin {
  return event.institutional ? 'base' : event.requirementId ? 'linked' : 'campus';
}

/**
 * Rows of the Activities step. Location is computed by origin and link, never by exclusion: every
 * date is a line of the by-date view, and every linked date is under its activity or under
 * “Vínculo a conferir”. Counters follow the unit of each view and every filter but pendency.
 */
export function activityStep(input: {
  state: CalendarState;
  events: readonly EditorEvent[];
  institutional: EditorEvent[];
  coverage: ReturnType<typeof activityCoverage>;
  search: Search;
  /** Activity kept visible whatever the filters: selected or opened by a review link. */
  pinned?: string;
}) {
  const { state, events, coverage, search } = input;
  const view: ActivityView = search.atividadeVisao === 'data' ? 'data' : 'atividade';
  const origin = search.atividadeOrigem ? originOf[search.atividadeOrigem] : undefined;
  const offer = search.atividadeOferta ? offerFor(state, search.atividadeOferta) : undefined;
  const query = searchText(search.atividadeBusca ?? '');
  const review = linksToReview(state);
  const checklist = activityChecklist(state).filter((item) => item.variant !== 'stage');
  const generated = new Map(activityChecklist(state).map((item) => [item.id, item]));
  // Only the offers being consulted decide an activity's status.
  const consulted = (id: string) =>
    coverage.filter((row) => row.requirement.id === id && (!offer || row.offerId === offer.id));
  const statusOf = (id: string) => activityStatus(consulted(id));
  const pendingStatus = (id: string) => {
    const summary = statusOf(id);
    return toFill.includes(summary.status) || summary.problems;
  };

  const activities: ActivityLine[] = checklist
    .filter((item) => {
      if (item.id === input.pinned) return true;
      if (!consulted(item.id).length) return false;
      if (origin && origin !== 'linked') return false;
      if (query && !searchText(`${item.name} ${item.basis ?? ''}`).includes(query)) return false;
      if (search.atividadeAssunto && item.group !== search.atividadeAssunto) return false;
      if (search.atividadeSituacao && statusOf(item.id).status !== search.atividadeSituacao)
        return false;
      return true;
    })
    .map((item) => ({
      item,
      status: statusOf(item.id),
      pending: pendingStatus(item.id),
      dates: state.events
        .filter((event) => event.requirementId === item.id && !review.has(event.id))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }));

  const dates: DateLine[] = [...events]
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
    .map((event) => {
      const issue = event.institutional ? undefined : review.get(event.id);
      const activity =
        event.requirementId && !issue ? generated.get(event.requirementId) : undefined;
      return {
        event,
        origin: dateOrigin(event),
        activity,
        issue,
        pending: Boolean(issue) || Boolean(activity && pendingStatus(activity.id)),
      };
    })
    .filter(
      (line) =>
        (!origin || line.origin === origin) &&
        (!offer || appliesTo(line.event, offer)) &&
        (!query || searchText(line.event.name).includes(query)),
    );

  const adjustable: AdjustableLine[] =
    origin && origin !== 'base'
      ? []
      : calendarObservances(input.institutional, state).flatMap((entry) => {
          const messages = observanceIssues(input.institutional, state)
            .filter((issue) => issue.key === entry.key)
            .map((issue) => issue.message);
          return messages.length &&
            (!query || searchText(`${entry.label} ${messages.join(' ')}`).includes(query))
            ? [{ key: entry.key, label: entry.label, messages }]
            : [];
        });

  const groups = {
    review: dates.filter((line) => line.issue),
    campus: dates.filter((line) => line.origin === 'campus'),
    base: dates.filter((line) => line.origin === 'base'),
  };
  const byActivity = [...activities, ...groups.review, ...groups.campus, ...groups.base];
  const units = view === 'atividade' ? byActivity : dates;
  const pendingUnits = units.filter((line) => line.pending).length + adjustable.length;
  const counts: Record<Pendency, number> = {
    '': units.length + adjustable.length,
    preencher: pendingUnits,
    'sem-pendencias': units.length - (pendingUnits - adjustable.length),
  };
  const pendency: Pendency = search.atividadePendencia ?? '';
  const keep = <T extends { pending: boolean }>(line: T) =>
    !pendency || (pendency === 'preencher') === line.pending;
  return {
    view,
    counts,
    adjustable: pendency === 'sem-pendencias' ? [] : adjustable,
    activities: activities.filter((line) => line.item.id === input.pinned || keep(line)),
    review: groups.review.filter(keep),
    campus: groups.campus.filter(keep),
    base: groups.base.filter(keep),
    dates: dates.filter(keep),
    /** Activities to fill that have no date, hence no line in the by-date view. */
    withoutDates: activities.filter((line) => line.pending && !line.dates.length).length,
  };
}
