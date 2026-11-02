import { activityPlan } from '#src/domain/calendar/activities/plan.ts';
import type { activityCoverage } from '#src/domain/calendar/activities/coverage.ts';
import {
  generatedActivities,
  generatedActivity,
  linkedTo,
  linksToReview,
  type LinkIssue,
} from '#src/domain/calendar/activities/links.ts';
import { activityStatus, type ActivityStatus } from '#src/domain/calendar/activities/status.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { appliesTo } from '#src/domain/calendar/modalities.ts';
import { calendarObservances, observanceIssues } from '#src/domain/calendar/observances.ts';
import { offerFor } from '#src/domain/calendar/offers.ts';
import type { ActivityPlanItem } from '#src/domain/calendar/model.ts';
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
  /** Key of the activity's link (`activityKey`): its address in the list, the panel and the URL. */
  key: string;
  item: ActivityPlanItem;
  status: ReturnType<typeof activityStatus>;
  pending: boolean;
  dates: EditorEvent[];
}
export interface DateLine {
  event: EditorEvent;
  origin: DateOrigin;
  /** Generated activity the date fulfils, unless its link is under review. */
  activity?: ActivityPlanItem;
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

export function dateOrigin(event: Pick<EditorEvent, 'institutional' | 'activity'>): DateOrigin {
  return event.institutional ? 'base' : event.activity ? 'linked' : 'campus';
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
  /** Key of the activity kept visible whatever the filters: selected or opened by a review link. */
  pinned?: string;
}) {
  const { state, events, coverage, search } = input;
  const view: ActivityView = search.atividadeVisao === 'data' ? 'data' : 'atividade';
  const origin = search.atividadeOrigem ? originOf[search.atividadeOrigem] : undefined;
  const offer = search.atividadeOferta ? offerFor(state, search.atividadeOferta) : undefined;
  const query = searchText(search.atividadeBusca ?? '');
  const review = linksToReview(state);
  const checklist = activityPlan(state).filter((item) => item.variant !== 'stage');
  const generated = generatedActivities(state);
  // Coverage rows by the key of their activity; only the offers being consulted decide its status.
  const rowsByKey = new Map<string, typeof coverage>();
  for (const row of coverage) {
    if (offer && row.offerId !== offer.id) continue;
    const key = activityKey(row.requirement.activity);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }
  const consulted = (key: string) => rowsByKey.get(key) ?? [];
  const statusOf = (key: string) => activityStatus(consulted(key));
  const pendingStatus = (key: string) => {
    const summary = statusOf(key);
    return toFill.includes(summary.status) || summary.problems;
  };

  const activities: ActivityLine[] = checklist
    .map((item) => ({ item, key: activityKey(item.activity) }))
    .filter(({ item, key }) => {
      if (key === input.pinned) return true;
      if (!consulted(key).length) return false;
      if (origin && origin !== 'linked') return false;
      if (query && !searchText(`${item.name} ${item.basis ?? ''}`).includes(query)) return false;
      if (search.atividadeAssunto && item.group !== search.atividadeAssunto) return false;
      if (search.atividadeSituacao && statusOf(key).status !== search.atividadeSituacao)
        return false;
      return true;
    })
    .map(({ item, key }) => ({
      key,
      item,
      status: statusOf(key),
      pending: pendingStatus(key),
      dates: state.events
        .filter((event) => linkedTo(event, item) && !review.has(event.id))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }));

  const dates: DateLine[] = [...events]
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
    .map((event) => {
      const issue = event.institutional ? undefined : review.get(event.id);
      const activity = issue ? undefined : generatedActivity(generated, event.activity);
      return {
        event,
        origin: dateOrigin(event),
        activity,
        issue,
        pending:
          Boolean(issue) || Boolean(activity && pendingStatus(activityKey(activity.activity))),
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
    activities: activities.filter((line) => line.key === input.pinned || keep(line)),
    review: groups.review.filter(keep),
    campus: groups.campus.filter(keep),
    base: groups.base.filter(keep),
    dates: dates.filter(keep),
    /** Activities to fill that have no date, hence no line in the by-date view. */
    withoutDates: activities.filter((line) => line.pending && !line.dates.length).length,
  };
}
