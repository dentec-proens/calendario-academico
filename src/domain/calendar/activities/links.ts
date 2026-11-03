import type {
  ActivityPlanItem,
  ActivityState,
  AssessmentSettings,
  CalendarEvent,
  CalendarPeriod,
} from '../model.ts';
import { equalValues } from '../../../shared/equal.ts';
import { DomainError } from '../../errors.ts';
import { offerFor, stageOrdinal, stagesPerTerm, stageTerm } from '../offers.ts';
import { activityPlan } from './plan.ts';
import { assessmentCycleIssue, assessmentIntervalIssue } from './assessment-intervals.ts';
import {
  activityKey,
  isAssessmentStage,
  isStageActivity,
  sameActivity,
  type ActivityRef,
  type StageActivityRef,
  type StagePosition,
} from './activity-ref.ts';
import { periodsForOffer } from '../organization/periods.ts';

type LinkState = Pick<ActivityState, 'year' | 'offers' | 'periods' | 'events'> &
  Partial<Pick<ActivityState, 'schemaVersion' | 'rulesetVersion'>>;
type LinkedDate = Pick<CalendarEvent, 'id' | 'activity' | 'start' | 'end' | 'scope'>;
type OfferState = Pick<AssessmentSettings, 'offers'>;

/** Rows the current configuration generates, by the key of their link (`activityKey`). */
export function generatedActivities(state: AssessmentSettings): Map<string, ActivityPlanItem> {
  return new Map(activityPlan(state).map((row) => [activityKey(row.activity), row]));
}

/** The generated row a link refers to; undefined without a link or a generated row. */
export const generatedActivity = (
  generated: ReadonlyMap<string, ActivityPlanItem>,
  activity: ActivityRef | undefined,
) => (activity ? generated.get(activityKey(activity)) : undefined);

/** The date is linked to this row: the same link, whatever the date's other fields. */
export const linkedTo = (
  event: Pick<CalendarEvent, 'activity'>,
  row: Pick<ActivityPlanItem, 'activity'>,
) => sameActivity(event.activity, row.activity);

/**
 * Position of a stage link in its offer under the current organization: the ordinal in the year
 * and its cycle; undefined when the offer is not in the calendar or has no such position.
 */
export function stageLocation(state: OfferState, activity: StageActivityRef) {
  const offer = offerFor(state, activity.offerId);
  const ordinal = offer && stageOrdinal(offer, activity.position);
  if (!offer || ordinal === undefined) return undefined;
  return { offerId: offer.id, ordinal, term: stageTerm(offer, ordinal) };
}

/**
 * The position the `n`-th stage of an offer has under some confirmed organization: annual `n`, or,
 * semestral with `p` stages per cycle, the first cycle's `n` (p >= n) or the second cycle's `n - p`
 * (n / 2 <= p < n). Confirming an organization re-expresses an unclassified position this way.
 */
function positionOfOrdinal(position: StagePosition, n: number) {
  if (position.status !== 'defined') return false;
  if (position.term === 'second') return position.number >= 1 && position.number <= n / 2;
  return position.number === n;
}

/**
 * The same link in two states of one calendar: the same key, or, for an unclassified link by offer
 * stage, the same activity and offer with a position that some organization gives its reported
 * ordinal, once the offer's organization is confirmed. Confirming the organization re-expresses an
 * unconfirmed position in the new cycles, as the format 4 identifier (`stage-N:offer`) did by its
 * ordinal (plan, phase 2, step 9e). A save may carry several confirmations, and a defined position
 * is then kept as the first one gave it (`reorganizedLinks`), so the stored ordinal is checked
 * against every organization, not only the final one. A defined position is never reinterpreted
 * (section 5.1): another position is a swap, and so is any position while the offer's organization
 * is not confirmed.
 */
export function sameLink(
  before: OfferState | undefined,
  previous: ActivityRef | undefined,
  after: OfferState,
  next: ActivityRef | undefined,
) {
  if (sameActivity(previous, next)) return true;
  if (
    !before ||
    !isStageActivity(previous) ||
    !isStageActivity(next) ||
    previous.position.status !== 'unclassified' ||
    previous.activityId !== next.activityId ||
    previous.offerId !== next.offerId
  )
    return false;
  const afterOffer = offerFor(after, next.offerId);
  return (
    afterOffer !== undefined &&
    afterOffer.organization !== 'a-classificar' &&
    stagesPerTerm(afterOffer) !== undefined &&
    positionOfOrdinal(next.position, previous.position.reportedOrdinal)
  );
}

/** States of one calendar compared by date ID; without them, links compare by key only. */
export interface LinkStates {
  before: OfferState;
  after: OfferState;
}

/**
 * Why a dated link cannot be accepted as fulfilment. The link is kept as recorded; the date is
 * shown under “Vínculo a conferir” and never counts toward coverage, stage days or printing.
 */
export type LinkIssue = 'unclassified' | 'duplicate-stage' | 'stage-sequence' | 'out-of-cycle';

export const linkIssueLabels: Record<LinkIssue, string> = {
  unclassified: 'Classificação pendente',
  'duplicate-stage': 'Etapa duplicada',
  'stage-sequence': 'Etapas fora de sequência',
  'out-of-cycle': 'Fora do período do ciclo',
};

export const linkIssueActions: Record<LinkIssue, string> = {
  unclassified:
    'A atividade gravada não existe na organização atual da oferta. Ajuste a organização ou exclua a data.',
  'duplicate-stage': 'Há outra data para a mesma etapa. Exclua uma delas.',
  'stage-sequence':
    'A etapa se sobrepõe a outra etapa do mesmo ciclo ou ocorre antes dela. Ajuste início e término.',
  'out-of-cycle': 'A etapa não cabe no período do seu ciclo. Ajuste início e término.',
};

/** Every date link that cannot count as fulfilment in the current configuration, by date ID. */
export function linksToReview(
  state: Omit<LinkState, 'events'> & { events: readonly LinkedDate[] },
): Map<string, LinkIssue> {
  const generated = generatedActivities(state);
  const issues = new Map<string, LinkIssue>();
  for (const event of state.events) {
    if (!event.activity) continue;
    const activity = generatedActivity(generated, event.activity);
    if (!activity || !coversDate(state, activity, event)) issues.set(event.id, 'unclassified');
  }
  const stages = state.events.filter(
    (event): event is LinkedDate & { activity: StageActivityRef } =>
      isAssessmentStage(event.activity) && !issues.has(event.id),
  );
  for (const event of stages)
    if (
      stages.some((other) => other.id !== event.id && sameActivity(other.activity, event.activity))
    )
      issues.set(event.id, 'duplicate-stage');
  for (const event of stages) {
    if (issues.has(event.id)) continue;
    const position = stageLocation(state, event.activity);
    if (!position) continue;
    for (const other of stages) {
      if (other.id === event.id || issues.get(other.id) === 'duplicate-stage') continue;
      const next = stageLocation(state, other.activity);
      if (!next || next.offerId !== position.offerId || next.term !== position.term) continue;
      if (
        (next.ordinal < position.ordinal && other.end >= event.start) ||
        (next.ordinal > position.ordinal && other.start <= event.end)
      ) {
        issues.set(event.id, 'stage-sequence');
        break;
      }
    }
  }
  for (const event of stages) {
    if (issues.has(event.id)) continue;
    const position = stageLocation(state, event.activity);
    if (!position?.term) continue;
    const periods = cyclePeriods(state, position.offerId, position.term);
    if (assessmentIntervalIssue(periods, event.start, event.end))
      issues.set(event.id, 'out-of-cycle');
  }
  return issues;
}

/**
 * The generated row is scoped to at least one offer of the date: a stage row to its offer, a cycle
 * row to the offers organised in that cycle.
 */
export function coversDate(
  state: Pick<LinkState, 'offers'>,
  activity: ActivityPlanItem,
  event: { scope: { offers: readonly string[] } },
) {
  return event.scope.offers.some((id) =>
    activity.offerId
      ? activity.offerId === id
      : activity.offerIds
        ? activity.offerIds.includes(id)
        : Boolean(offerFor(state, id)),
  );
}

function cyclePeriods(
  state: Pick<LinkState, 'offers' | 'periods'>,
  offerId: string,
  term: string,
): CalendarPeriod[] {
  return periodsForOffer(state, offerId).filter(
    (period) => period.association.status === 'defined' && period.association.term === term,
  );
}

const keptLink = (
  previous: CalendarEvent | undefined,
  next: CalendarEvent,
  states: LinkStates | undefined,
) =>
  states
    ? sameLink(states.before, previous?.activity, states.after, next.activity)
    : sameActivity(previous?.activity, next.activity);

/** Dates whose start, end, offers and link match the previous state are left as they are. */
export function dateEdited(
  previous: CalendarEvent | undefined,
  next: CalendarEvent,
  states?: LinkStates,
) {
  return (
    !previous ||
    previous.start !== next.start ||
    previous.end !== next.end ||
    !keptLink(previous, next, states) ||
    !equalValues(previous.scope.offers, next.scope.offers)
  );
}

/** The date keeps exactly the link it already had: no generated activity is required for it. */
export function linkKept(
  previous: CalendarEvent | undefined,
  next: CalendarEvent,
  states?: LinkStates,
) {
  return !!next.activity && !!previous?.activity && keptLink(previous, next, states);
}

const describe = (event: CalendarEvent) =>
  `“${event.name}” (${event.start.split('-').reverse().join('/')})`;

/**
 * Link rule shared by saving, importing and editing commands, against the previous state of the
 * same calendar (by date ID):
 * 1. a date that keeps its link needs no generated activity;
 * 2. an edited date (start, end, offers or link) passes every interval and association check, and
 *    any conflict with another date, even an unchanged one, refuses the change;
 * 3. an unchanged date is never refused for a conflict: it is reported by `linksToReview`.
 * A recorded date never loses, swaps or gains a link by these paths; only removing the date does.
 * These are the contracts of the date commands (`planActivityDate`, `createCampusDate`,
 * `updateDate`) at the save boundary, which receives the whole state and not the command.
 */
export function validateLinks(
  previous: (OfferState & { events: readonly CalendarEvent[] }) | undefined,
  next: LinkState,
) {
  const before = new Map(previous?.events.map((event) => [event.id, event]));
  const states = previous && { before: previous, after: next };
  const requirements = generatedActivities(next);
  const changed = next.events.filter((event) => {
    const old = before.get(event.id);
    return old?.activity !== undefined && !linkKept(old, event, states);
  });
  if (changed.length)
    throw new DomainError(
      `Uma data salva não perde nem troca a atividade vinculada: ${changed.map(describe).join('; ')}.`,
    );
  // `updateDate` keeps the link of a saved date: a date of the campus never gains one.
  const gained = next.events.filter((event) => {
    const old = before.get(event.id);
    return old !== undefined && old.activity === undefined && event.activity !== undefined;
  });
  if (gained.length)
    throw new DomainError(
      `Uma data do campus não passa a ter atividade vinculada: ${gained.map(describe).join('; ')}.`,
    );
  // A re-expressed stage position must be unambiguous: no other date holds it (step 9e).
  const ambiguous = next.events.filter((event) => {
    const old = before.get(event.id)?.activity;
    return (
      old !== undefined &&
      !sameActivity(old, event.activity) &&
      next.events.some(
        (other) => other.id !== event.id && sameActivity(other.activity, event.activity),
      )
    );
  });
  if (ambiguous.length)
    throw new DomainError(
      `Uma etapa só passa à posição da nova organização quando nenhuma outra data a ocupa: ${ambiguous.map(describe).join('; ')}.`,
    );
  const unknown = next.events.filter(
    (event) =>
      event.activity &&
      !generatedActivity(requirements, event.activity) &&
      !linkKept(before.get(event.id), event, states),
  );
  if (unknown.length)
    throw new DomainError(
      `Vínculo de atividade inválido para esta organização: ${unknown.map(describe).join('; ')}.`,
    );
  for (const event of next.events) {
    if (!event.activity || !dateEdited(before.get(event.id), event, states)) continue;
    const activity = generatedActivity(requirements, event.activity);
    // A kept link without generated activity has no cycle or scope to check its dates against.
    if (!activity) continue;
    const offers = event.scope.offers;
    if (activity.offerId && (offers.length !== 1 || offers[0] !== activity.offerId))
      throw new DomainError('A etapa deve estar vinculada à sua oferta.');
    if (!coversDate(next, activity, event))
      throw new DomainError(
        `A atividade vinculada não abrange as ofertas da data “${event.name}”.`,
      );
    const issue = assessmentCycleIssue(next, event);
    if (issue) throw new DomainError(issue);
  }
}
