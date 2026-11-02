import type {
  ActivityRequirement,
  ActivityState,
  CalendarActivity,
  CalendarPeriod,
} from '../model.ts';
import { equalValues } from '../../../shared/equal.ts';
import { DomainError } from '../../errors.ts';
import { offerFor, offerIds, stageTerm } from '../offers.ts';
import { activityChecklist } from './checklist.ts';
import { assessmentCycleIssue, assessmentIntervalIssue } from './assessment-intervals.ts';
import { isStageRequirementId } from './metadata.ts';
import { periodsForOffer } from '../organization/periods.ts';

type LinkState = Pick<ActivityState, 'year' | 'offers' | 'periods' | 'events'> &
  Partial<Pick<ActivityState, 'schemaVersion' | 'rulesetVersion'>>;
type LinkedDate = Pick<CalendarActivity, 'id' | 'requirementId' | 'start' | 'end' | 'offers'>;

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
  const generated = new Map(activityChecklist(state).map((row) => [row.id, row]));
  const issues = new Map<string, LinkIssue>();
  for (const event of state.events) {
    if (!event.requirementId) continue;
    const activity = generated.get(event.requirementId);
    if (!activity || !coversDate(state, activity, event)) issues.set(event.id, 'unclassified');
  }
  const stages = state.events.filter(
    (event) => isStageRequirementId(event.requirementId) && !issues.has(event.id),
  );
  for (const event of stages)
    if (
      stages.some((other) => other.id !== event.id && other.requirementId === event.requirementId)
    )
      issues.set(event.id, 'duplicate-stage');
  for (const event of stages) {
    if (issues.has(event.id)) continue;
    const position = stagePosition(state, event);
    if (!position) continue;
    for (const other of stages) {
      if (other.id === event.id || issues.get(other.id) === 'duplicate-stage') continue;
      const next = stagePosition(state, other);
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
    const position = stagePosition(state, event);
    if (!position?.term) continue;
    const periods = cyclePeriods(state, position.offerId, position.term);
    if (assessmentIntervalIssue(periods, event.start, event.end))
      issues.set(event.id, 'out-of-cycle');
  }
  return issues;
}

/**
 * The generated row is scoped to at least one offer of the date (all offers when absent): a stage
 * row to its offer, a cycle row to the offers organised in that cycle.
 */
export function coversDate(
  state: Pick<LinkState, 'offers'>,
  activity: ActivityRequirement,
  event: Pick<CalendarActivity, 'offers'>,
) {
  const offers = event.offers?.length ? event.offers : offerIds(state);
  return offers.some((id) =>
    activity.offerId
      ? activity.offerId === id
      : activity.offerIds
        ? activity.offerIds.includes(id)
        : Boolean(offerFor(state, id)),
  );
}

function stagePosition(state: Pick<LinkState, 'offers'>, event: LinkedDate) {
  const [stage, offerId] = event.requirementId!.split(':');
  const offer = offerFor(state, offerId);
  if (!offer) return undefined;
  const ordinal = Number(stage.slice('stage-'.length));
  return { offerId, ordinal, term: stageTerm(offer, ordinal) };
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

/** Dates whose start, end, offers and link match the previous state are left as they are. */
export function dateEdited(previous: CalendarActivity | undefined, next: CalendarActivity) {
  return (
    !previous ||
    previous.start !== next.start ||
    previous.end !== next.end ||
    previous.requirementId !== next.requirementId ||
    !equalValues(previous.offers, next.offers)
  );
}

/** The date keeps exactly the link it already had: no generated activity is required for it. */
export function linkKept(previous: CalendarActivity | undefined, next: CalendarActivity) {
  return !!next.requirementId && previous?.requirementId === next.requirementId;
}

const describe = (event: CalendarActivity) =>
  `“${event.name}” (${event.start.split('-').reverse().join('/')})`;

/**
 * Link rule shared by saving, importing and editing commands, against the previous state of the
 * same calendar (by date ID):
 * 1. a date that keeps its link needs no generated activity;
 * 2. an edited date (start, end, offers or link) passes every interval and association check, and
 *    any conflict with another date, even an unchanged one, refuses the change;
 * 3. an unchanged date is never refused for a conflict: it is reported by `linksToReview`.
 * A recorded date never loses or swaps its link by these paths; only removing the date does.
 */
export function validateLinks(
  previous: { events: readonly CalendarActivity[] } | undefined,
  next: LinkState,
) {
  const before = new Map(previous?.events.map((event) => [event.id, event]));
  const requirements = new Map(activityChecklist(next).map((row) => [row.id, row]));
  const changed = next.events.filter((event) => {
    const old = before.get(event.id);
    return old?.requirementId !== undefined && old.requirementId !== event.requirementId;
  });
  if (changed.length)
    throw new DomainError(
      `Uma data salva não perde nem troca a atividade vinculada: ${changed.map(describe).join('; ')}.`,
    );
  const unknown = next.events.filter(
    (event) =>
      event.requirementId &&
      !requirements.has(event.requirementId) &&
      !linkKept(before.get(event.id), event),
  );
  if (unknown.length)
    throw new DomainError(
      `Vínculo de atividade inválido para esta organização: ${unknown.map(describe).join('; ')}.`,
    );
  for (const event of next.events) {
    if (!event.requirementId || !dateEdited(before.get(event.id), event)) continue;
    const activity = requirements.get(event.requirementId);
    // A kept link without generated activity has no cycle or scope to check its dates against.
    if (!activity) continue;
    if (activity.offerId && (event.offers?.length !== 1 || event.offers[0] !== activity.offerId))
      throw new DomainError('A etapa deve estar vinculada à sua oferta.');
    if (!coversDate(next, activity, event))
      throw new DomainError(
        `A atividade vinculada não abrange as ofertas da data “${event.name}”.`,
      );
    const issue = assessmentCycleIssue(next, event);
    if (issue) throw new DomainError(issue);
  }
}
