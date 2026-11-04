import type {
  ActivityPlanItem,
  ActivityState,
  AssessmentSettings,
  CalendarEvent,
  CalendarPeriod,
} from '../model.ts';
import { equalValues } from '../../../shared/equal.ts';
import { DomainError } from '../../errors.ts';
import { offerFor, stageOrdinal, stageTerm } from '../offers.ts';
import { activityPlan } from './plan.ts';
import { assessmentCycleIssue, assessmentIntervalIssue } from './assessment-intervals.ts';
import {
  activityKey,
  isAssessmentStage,
  isStageActivity,
  sameActivity,
  type ActivityRef,
  type StageActivityRef,
} from './activity-ref.ts';
import { periodsForOffer } from '../organization/periods.ts';

type LinkState = Pick<ActivityState, 'year' | 'offers' | 'periods' | 'events'> &
  Partial<Pick<ActivityState, 'schemaVersion' | 'rulesetVersion'>>;
type LinkedDate = Pick<CalendarEvent, 'id' | 'activity' | 'start' | 'end' | 'offers'>;
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
 * Why a dated link cannot be accepted as fulfilment. The link is kept as recorded; the date is
 * shown under “Vínculo a conferir” and never counts toward coverage, stage days or printing.
 */
export type LinkIssue = 'not-generated' | 'duplicate-stage' | 'stage-sequence' | 'out-of-cycle';

export const linkIssueLabels: Record<LinkIssue, string> = {
  'not-generated': 'Atividade não gerada',
  'duplicate-stage': 'Etapa duplicada',
  'stage-sequence': 'Etapas fora de sequência',
  'out-of-cycle': 'Fora do período do ciclo',
};

export const linkIssueActions: Record<LinkIssue, string> = {
  'not-generated':
    'A atividade gravada não existe na organização atual da oferta. Corrija a atividade vinculada, ajuste a organização ou exclua a data.',
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
    if (!activity || !coversDate(state, activity, event)) issues.set(event.id, 'not-generated');
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
 * The generated row is for at least one offer of the date: a stage row to its offer, a cycle
 * row to the offers organised in that cycle.
 */
export function coversDate(
  state: Pick<LinkState, 'offers'>,
  activity: ActivityPlanItem,
  event: { offers: readonly string[] },
) {
  return event.offers.some((id) =>
    activity.offerId
      ? activity.offerId === id
      : activity.offerIds
        ? activity.offerIds.includes(id)
        : Boolean(offerFor(state, id)),
  );
}

/**
 * The generated row reaches every offer of the date: a stage row only its own offer, a cycle row
 * each offer organised in that cycle. Correcting the linked activity keeps the date's offers, so
 * the new activity must cover all of it.
 */
export function coversAllOffers(
  state: Pick<LinkState, 'offers'>,
  activity: ActivityPlanItem,
  event: { offers: readonly string[] },
) {
  const offers = event.offers;
  if (activity.offerId) return offers.length === 1 && offers[0] === activity.offerId;
  return (
    offers.length > 0 &&
    offers.every((id) =>
      activity.offerIds ? activity.offerIds.includes(id) : Boolean(offerFor(state, id)),
    )
  );
}

/**
 * The date had its linked activity corrected (`changeActivity`): it was under “Vínculo a conferir”
 * in the previous state (`toReview`, by date ID), and the new link names a generated activity that
 * covers all the offers of the date. Other fields may change in the same save, as `updateDate`
 * after the correction would change them: the corrected date passes every check of an edited
 * date. A date put under review only by other changes of the same save is not corrected with
 * them, since the swap would replace a link that counted; the interface offers the correction once
 * those changes are saved (`correctableLinkIssue`). Removing a link is never a correction, and a
 * link that counts is never swapped: a stage position is not reinterpreted.
 */
export function linkCorrected(
  state: Pick<LinkState, 'offers'>,
  generated: ReadonlyMap<string, ActivityPlanItem>,
  toReview: ReadonlySet<string>,
  previous: CalendarEvent | undefined,
  next: CalendarEvent,
) {
  if (
    !previous?.activity ||
    !toReview.has(previous.id) ||
    !next.activity ||
    sameActivity(previous.activity, next.activity)
  )
    return false;
  const activity = generatedActivity(generated, next.activity);
  return !!activity && coversAllOffers(state, activity, next);
}

function cyclePeriods(
  state: Pick<LinkState, 'offers' | 'periods'>,
  offerId: string,
  term: string,
): CalendarPeriod[] {
  return periodsForOffer(state, offerId).filter((period) => period.association.term === term);
}

/** Dates whose start, end, offers and link match the previous state are left as they are. */
export function dateEdited(previous: CalendarEvent | undefined, next: CalendarEvent) {
  return (
    !previous ||
    previous.start !== next.start ||
    previous.end !== next.end ||
    !sameActivity(previous.activity, next.activity) ||
    !equalValues(previous.offers, next.offers)
  );
}

/** The date keeps exactly the link it already had: no generated activity is required for it. */
export const linkKept = (previous: CalendarEvent | undefined, next: CalendarEvent) =>
  !!next.activity && sameActivity(previous?.activity, next.activity);

const describe = (event: CalendarEvent) =>
  `“${event.name}” (${event.start.split('-').reverse().join('/')})`;

/**
 * Link rule shared by saving, importing and editing commands, against the previous state of the
 * same calendar (by date ID):
 * 1. a date that keeps its link needs no generated activity;
 * 2. an edited date (start, end, offers or link) passes every interval and association check, and
 *    any conflict with another date, even an unchanged one, refuses the change;
 * 3. an unchanged date is never refused for a conflict: it is reported by `linksToReview`.
 * A recorded date never loses or gains a link by these paths, and swaps it only by a correction of
 * the linked activity (`linkCorrected`): the date was under review, the new activity is generated
 * and covers every offer of the date; the corrected date then passes the checks of an edited date,
 * with any other change made to it in the same save.
 * These are the contracts of the date commands (`planActivityDate`, `createCampusDate`,
 * `updateDate`, `changeActivity`) at the save boundary, which receives the whole state and not the
 * command.
 */
export function validateLinks(
  previous: (Omit<LinkState, 'events'> & { events: readonly CalendarEvent[] }) | undefined,
  next: LinkState,
) {
  const before = new Map(previous?.events.map((event) => [event.id, event]));
  const requirements = generatedActivities(next);
  const toReview = new Set(previous ? linksToReview(previous).keys() : []);
  const corrected = (event: CalendarEvent) =>
    linkCorrected(next, requirements, toReview, before.get(event.id), event);
  const changed = next.events.filter((event) => {
    const old = before.get(event.id);
    return old?.activity !== undefined && !linkKept(old, event) && !corrected(event);
  });
  if (changed.length)
    throw new DomainError(
      `Uma data salva não perde nem troca a atividade vinculada, exceto pela correção do vínculo de data em Vínculo a conferir para atividade gerada que abranja todas as suas ofertas: ${changed.map(describe).join('; ')}.`,
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
  // Two dates of one activity are normal; a stage position is held by one date only, so a
  // correction never puts a date on a position another date holds.
  const ambiguous = next.events.filter(
    (event) =>
      corrected(event) &&
      isStageActivity(event.activity) &&
      next.events.some(
        (other) => other.id !== event.id && sameActivity(other.activity, event.activity),
      ),
  );
  if (ambiguous.length)
    throw new DomainError(
      `Uma etapa só passa a uma posição pela correção do vínculo quando nenhuma outra data a ocupa: ${ambiguous.map(describe).join('; ')}.`,
    );
  const unknown = next.events.filter(
    (event) =>
      event.activity &&
      !generatedActivity(requirements, event.activity) &&
      !linkKept(before.get(event.id), event),
  );
  if (unknown.length)
    throw new DomainError(
      `Vínculo de atividade inválido para esta organização: ${unknown.map(describe).join('; ')}.`,
    );
  for (const event of next.events) {
    if (!event.activity || !dateEdited(before.get(event.id), event)) continue;
    const activity = generatedActivity(requirements, event.activity);
    // A kept link without generated activity has no cycle or offers to check its dates against.
    if (!activity) continue;
    const offers = event.offers;
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
