import { searchText } from '#src/shared/search-text.ts';
import { activityPlan } from '#src/domain/calendar/activities/plan.ts';
import {
  generatedActivities,
  generatedActivity,
  linkedTo,
  type LinkIssue,
} from '#src/domain/calendar/activities/links.ts';
import {
  activitySituation,
  evaluatePlan,
  type PlanEvaluation,
} from '#src/domain/calendar/activities/plan-evaluation.ts';
import { activityGroups } from '#src/domain/calendar/activities/metadata.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { isInternalDate } from '#src/domain/calendar/internal-dates.ts';
import { appliesTo } from '#src/domain/calendar/modalities.ts';
import {
  applyObservances,
  calendarObservances,
  observanceIssues,
} from '#src/domain/calendar/observances.ts';
import { offerFor } from '#src/domain/calendar/offers.ts';
import {
  groupPendencies,
  type Pendency as CalendarPendency,
} from '#src/domain/calendar/pendencies.ts';
import { contentIssues } from '#src/domain/calendar/readiness.ts';
import {
  projectDates,
  type ActivityPlanItem,
  type InstitutionalEventSnapshot,
} from '#src/domain/calendar/model.ts';
import { recordOffers } from './event-draft.ts';
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
export const visibilityFilters = [
  ['', 'Todas as datas'],
  ['oficiais', 'Oficiais'],
  ['internas', 'Internas'],
] as const;
const originOf = { vinculadas: 'linked', campus: 'campus', base: 'base' } as const;

export interface ActivityLine {
  /** Key of the activity's link (`activityKey`): its address in the list, the panel and the URL. */
  key: string;
  item: ActivityPlanItem;
  status: ReturnType<typeof activitySituation>;
  /** The activity is a pendency of the calendar, for the offers being consulted. */
  pending: boolean;
  /** Whether the filters select it, rather than being kept only because it is pinned. */
  matches: boolean;
  /** Offers the activity may cover, shown as badges when the calendar has several. */
  offerIds: string[];
  dates: EditorEvent[];
}
export interface DateLine {
  event: EditorEvent;
  origin: DateOrigin;
  /** Generated activity the date fulfils, unless its link is under review. */
  activity?: ActivityPlanItem;
  issue?: LinkIssue;
  /** In the by-date view, the date's own issue or that of its activity. */
  pending: boolean;
}
export interface AdjustableLine {
  key: string;
  label: string;
  messages: string[];
}

export function dateOrigin(event: Pick<EditorEvent, 'institutional' | 'activity'>): DateOrigin {
  return event.institutional ? 'base' : event.activity ? 'linked' : 'campus';
}

/**
 * Rows of the Activities step. Location is computed by origin and link, never by exclusion: every
 * date is a line of the by-date view, and every linked date is under its activity or under
 * “Vínculo a conferir”. Counters follow the unit of each view and every filter but pendency. What
 * is pending comes from the calendar's pendencies, so with no filter the by-activity counter is the
 * number the step menu shows; an activity whose application is still to confirm is not one of them
 * and stays visible by its situation.
 */
export function activityStep(input: {
  state: CalendarState;
  events: readonly EditorEvent[];
  institutional: EditorEvent[];
  /** Evaluation of the plan (`evaluatePlan`) over the same state. */
  evaluation: PlanEvaluation;
  /** Pending items of the calendar (`groupPendencies`) over the same state. */
  pendencies: readonly CalendarPendency[];
  search: Search;
  /** Key of the activity kept visible whatever the filters: selected or opened by a review link. */
  pinned?: string;
}) {
  const { state, events, evaluation, search } = input;
  const view: ActivityView = search.atividadeVisao === 'data' ? 'data' : 'atividade';
  const origin = search.atividadeOrigem ? originOf[search.atividadeOrigem] : undefined;
  const offer = search.atividadeOferta ? offerFor(state, search.atividadeOferta) : undefined;
  const query = searchText(search.atividadeBusca ?? '');
  // Visibility hides date lines only; coverage, situation and pendency stay as evaluated. Activities
  // never hold internal dates, so “Oficiais” keeps all of them and “Internas” hides all of them.
  const visibility = search.atividadeVisibilidade;
  const review = evaluation.links.issues;
  // Stages and vacations are filled in steps of their own.
  const checklist = activityPlan(state).filter(
    (item) => item.variant !== 'stage' && item.variant !== 'vacation',
  );
  const generated = generatedActivities(state);
  // Coverage rows by the key of their activity; only the offers being consulted decide its status.
  const rowsByKey = new Map<string, PlanEvaluation['rows']>();
  for (const row of evaluation.rows) {
    if (offer && row.offerId !== offer.id) continue;
    const key = activityKey(row.requirement.activity);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }
  const consulted = (key: string) => rowsByKey.get(key) ?? [];
  const statusOf = (key: string) => activitySituation(consulted(key));
  // An item with no offer named by its diagnostics concerns every offer being consulted.
  const concerns = (item: CalendarPendency) =>
    !offer || !item.offerIds.length || item.offerIds.includes(offer.id);
  const pendingActivities = new Set(input.pendencies.filter(concerns).map((item) => item.key));
  const activityPending = (key: string) => pendingActivities.has(`activity:${key}`);
  const dateIssues = new Set(
    input.pendencies.flatMap((item) => (item.target?.area === 'date' ? [item.target.eventId] : [])),
  );
  const matches = (item: ActivityPlanItem, key: string) => {
    if (!consulted(key).length) return false;
    // A row merged into another activity is kept only to read old links: listed while it has one.
    if (item.mergedInto && !consulted(key).some((row) => row.events.length)) return false;
    if (origin && origin !== 'linked') return false;
    if (visibility === 'internas') return false;
    if (query && !searchText(`${item.name} ${item.basis ?? ''}`).includes(query)) return false;
    if (search.atividadeAssunto && item.group !== search.atividadeAssunto) return false;
    if (search.atividadeSituacao && statusOf(key).status !== search.atividadeSituacao) return false;
    return true;
  };

  const activities: ActivityLine[] = checklist
    .map((item) => ({ item, key: activityKey(item.activity) }))
    .filter(({ item, key }) => key === input.pinned || matches(item, key))
    .map(({ item, key }) => ({
      key,
      item,
      status: statusOf(key),
      pending: activityPending(key),
      matches: matches(item, key),
      offerIds: recordOffers(state, item),
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
          Boolean(issue) ||
          dateIssues.has(event.id) ||
          Boolean(activity && activityPending(activityKey(activity.activity))),
      };
    })
    .filter(
      (line) =>
        (!origin || line.origin === origin) &&
        (!visibility || (visibility === 'internas') === isInternalDate(line.event)) &&
        (!offer || appliesTo(line.event, offer)) &&
        (!query || searchText(line.event.name).includes(query)),
    );

  const adjustable: AdjustableLine[] =
    (origin && origin !== 'base') || visibility === 'internas'
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

  // Beside the activities a date counts only for itself: a date of a pending activity is the same
  // pendency as the activity, which already has its line.
  const ownLine = (line: DateLine) => ({
    ...line,
    pending: Boolean(line.issue) || dateIssues.has(line.event.id),
  });
  const groups = {
    review: dates.filter((line) => line.issue).map(ownLine),
    campus: dates.filter((line) => line.origin === 'campus').map(ownLine),
    base: dates.filter((line) => line.origin === 'base').map(ownLine),
  };
  const byActivity = [
    ...activities.filter((line) => line.matches),
    ...groups.review,
    ...groups.campus,
    ...groups.base,
  ];
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
    /** Whether the visibility filter hides every activity (“Internas”). */
    activitiesHidden: visibility === 'internas',
    /** Activities to fill that have no date, hence no line in the by-date view. */
    activitiesWithoutDates: activities.filter(
      (line) => line.matches && line.pending && !line.dates.length,
    ).length,
  };
}

/** The Activities step of a state not rendered yet, computed as the editor computes it. */
export function activityStepFor(input: {
  state: CalendarState;
  baseEvents: InstitutionalEventSnapshot[];
  search: Search;
  pinned?: string;
}) {
  const { state, baseEvents, search, pinned } = input;
  const institutional = applyObservances(baseEvents, state);
  return activityStep({
    state,
    events: projectDates(institutional, state.events),
    institutional,
    evaluation: evaluatePlan(state),
    pendencies: groupPendencies(contentIssues(state, baseEvents), state),
    search,
    pinned,
  });
}

/** Activities in the order the list shows them: by subject, then as the plan declares them. */
export const inListOrder = <T extends Pick<ActivityLine, 'item'>>(lines: readonly T[]) =>
  activityGroups.flatMap(([group]) => lines.filter((line) => line.item.group === group));

/**
 * The pending activity after `current`, in the order of the list and under its filters. The search
 * goes on from the start of the list: an activity skipped earlier is still “another pending
 * activity”, so only an empty result may say that none is left. `lines` must keep `current` pinned.
 */
export function nextPendingActivity(lines: readonly ActivityLine[], current: string) {
  const ordered = inListOrder(lines);
  const at = ordered.findIndex((line) => line.key === current);
  return [...ordered.slice(at + 1), ...ordered.slice(0, Math.max(at, 0))].find(
    (line) => line.matches && line.pending && line.key !== current,
  );
}
