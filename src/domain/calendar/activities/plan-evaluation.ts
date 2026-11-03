import {
  isLocalDate,
  type AssessmentSettings,
  type CalendarEvent,
  type CalendarPeriod,
  type ProjectedDate,
} from '../model.ts';
import { appliesTo } from '../modalities.ts';
import { calendarOffers } from '../offers.ts';
import { policyFor } from '../../policies/registry.ts';
import { admissionDestination, temporalPosition, validateActivityRecord } from './validation.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { prorogatedDeadline } from './deadlines.ts';
import type { ActivityRef } from './activity-ref.ts';
import {
  coversDate,
  generatedActivities,
  generatedActivity,
  linkIssueActions,
  linkIssueLabels,
  linkedTo,
  linksToReview,
  type LinkIssue,
} from './links.ts';

/**
 * Calculated evaluation of the activity plan, by activity × offer. Each
 * dimension is computed apart and none is stored as a flag:
 * - classification: whether a date's link fits the current organization and periods;
 * - applicability: required, optional or to confirm, from the policy and the configuration;
 * - coverage: whether the dates plan the activity (dates, hours, confirmed scope);
 * - execution: whether the linked notices were scheduled or published;
 * - human review: whether a current review checked the criterion of the activity.
 * UI, backend, comparison and printing read the evaluation from this module only.
 */

/** A link under the current configuration: no generated activity, fitting, or in conflict. */
export type Classification = 'pending' | 'compatible' | 'divergent';
export type Applicability = 'required' | 'optional' | 'unconfigured';
export type Coverage = 'pending' | 'partial' | 'complete';
export type Execution = 'planned' | 'published' | 'unclassified';
export type HumanReview = 'reviewed' | 'pending' | 'unmapped';

export const classificationLabels: Record<Classification, string> = {
  pending: 'Classificação pendente',
  compatible: 'Compatível',
  divergent: 'Divergente',
};

/** Execution of a notice, as the campus records it (`notice.publication`). */
export const executionLabels: Record<Exclude<Execution, 'unclassified'>, string> = {
  planned: 'Publicação programada',
  published: 'Publicação realizada',
};

/** A pending classification is a link without generated activity; any other reason diverges. */
export const classificationOf = (issue: LinkIssue | undefined): Classification =>
  !issue ? 'compatible' : issue === 'unclassified' ? 'pending' : 'divergent';

/** The classification of one linked date for one offer of its scope. */
export interface LinkEvaluation {
  eventId: string;
  offerId: string;
  activity: ActivityRef;
  classification: Classification;
  /** Why the date is under “Vínculo a conferir”, for the date as a whole. */
  issue?: LinkIssue;
}

type LinkState = Parameters<typeof linksToReview>[0];

/**
 * Classification of every dated link, by date and by offer of the date. A date under review
 * (`linksToReview`) never counts as fulfilment; for one offer, a link is also pending when the
 * generated activity does not reach that offer (a cycle the offer is not organised in).
 */
export function classifyLinks(state: LinkState) {
  const issues = linksToReview(state);
  const generated = generatedActivities(state);
  const byOffer: LinkEvaluation[] = [];
  for (const event of state.events) {
    if (!event.activity) continue;
    const issue = issues.get(event.id);
    const row = generatedActivity(generated, event.activity);
    for (const offerId of event.scope.offers) {
      const reaches = row !== undefined && coversDate(state, row, { scope: { offers: [offerId] } });
      byOffer.push({
        eventId: event.id,
        offerId,
        activity: event.activity,
        classification: reaches ? classificationOf(issue) : 'pending',
        ...(issue ? { issue } : {}),
      });
    }
  }
  const index = new Map(byOffer.map((item) => [`${item.eventId}\u0000${item.offerId}`, item]));
  return {
    /** Dates under “Vínculo a conferir”, by date ID, with the reason. */
    issues: issues as ReadonlyMap<string, LinkIssue>,
    /** Every linked date × offer of its scope. */
    byOffer,
    /** Classification of the date for one offer; undefined for an unlinked date or offer. */
    forOffer: (eventId: string, offerId: string) =>
      index.get(`${eventId}\u0000${offerId}`)?.classification,
  };
}

export type LinkClassification = ReturnType<typeof classifyLinks>;

/** Execution of the linked dates: published when all are, planned when any is. */
export function executionOf(events: readonly Pick<CalendarEvent, 'notice'>[]): Execution {
  return events.length && events.every((e) => e.notice?.publication === 'published')
    ? 'published'
    : events.some((e) => e.notice?.publication === 'planned')
      ? 'planned'
      : 'unclassified';
}

type EvaluationState = AssessmentSettings & {
  year: number;
  periods: CalendarPeriod[];
  events: CalendarEvent[];
  weekdays?: number[];
  weekConfirmed?: boolean;
};

/**
 * Evaluation of the plan: one row per generated activity × offer, and the classification of every
 * dated link by offer. `events` is the editor projection; only local dates carry links, and
 * institutional dates still prorogate deadlines.
 */
export function evaluatePlan(
  state: EvaluationState,
  events: readonly ProjectedDate[] = state.events,
  humanReview?: { current: boolean; reviewedCriterionIds: readonly string[] },
) {
  const policy = policyFor(state.year);
  const local = events.filter(isLocalDate);
  const links = classifyLinks({ ...state, events: local });
  const rows = policy.requirements(state).flatMap((requirement) =>
    calendarOffers(state)
      .filter((offer) => !requirement.offerId || requirement.offerId === offer.id)
      .map((offer) => {
        const modality = offer.id;
        const applicability: Applicability = policy.applicability(state, requirement, offer);
        const linked = local.filter(
          (event) => linkedTo(event, requirement) && appliesTo(event, offer),
        );
        const issues: string[] = [],
          warnings: string[] = [];
        const valid = linked.filter((event) => {
          const reason = links.issues.get(event.id);
          // The date blocks the conclusion once, by its own readiness issue (`readiness.ts`); the
          // row only warns, so the same date is not counted again for each of its offers.
          if (reason) {
            warnings.push(`${linkIssueLabels[reason]}: ${linkIssueActions[reason]}`);
            return false;
          }
          // A date whose generated activity does not reach this offer is pending for it: it never
          // counts as fulfilment here, even when it fits another offer of its scope.
          if (links.forOffer(event.id, offer.id) !== 'compatible') {
            warnings.push(`${linkIssueLabels.unclassified}: ${linkIssueActions.unclassified}`);
            return false;
          }
          // Under explicit offers (2027), only a scope the campus confirmed counts.
          if (policy.explicitRecordOffers && !event.scope.confirmed) {
            // Same text as format 4. The stored oracle (`test/fixtures/stored/oracle.json`)
            // records it in the coverage issues and `test/domain/event-scope.test.ts` checks it:
            // rewording it means updating both.
            issues.push('Confirme explicitamente as ofertas abrangidas pelo registro legado.');
            return false;
          }
          try {
            validateActivityRecord(state, event);
          } catch (error) {
            issues.push(error instanceof Error ? error.message : String(error));
            return false;
          }
          if (requirement.admissionType) {
            const admission = event.notice?.admission;
            if (
              !admission ||
              admission.type !== requirement.admissionType ||
              !event.notice?.publication
            ) {
              issues.push('Classificação de ingresso a conferir.');
              return false;
            }
            const expectedYear =
              requirement.admissionType === 'regular' ? state.year + 1 : state.year;
            if (
              admission.year !== expectedYear ||
              (requirement.term && admission.term !== requirement.term)
            ) {
              issues.push('Finalidade de ingresso incompatível com o requisito.');
              return false;
            }
            if (admission.type === 'transfer') {
              // Each offer is checked against its own destination.
              const periodId = admissionDestination(event, modality);
              const period = periodId
                ? periodsForOffer(state, modality).find((p) => p.id === periodId)
                : undefined;
              if (
                !period ||
                period.association?.status !== 'defined' ||
                period.association.term !== admission.term
              ) {
                issues.push('Vincule o período de ingresso correspondente à oferta.');
                return false;
              }
              if (event.end >= period.start) {
                issues.push('Publique antes do início do período letivo de destino.');
                return false;
              }
            }
          }
          const deadline = requirement.deadline
            ? requirement.deadlinePolicy === 'reference'
              ? prorogatedDeadline(state, requirement.deadline, events, modality)
              : {
                  date: requirement.deadline,
                  original: requirement.deadline,
                  source: 'norm' as const,
                  evidence: [] as string[],
                }
            : null;
          if (deadline?.source === 'municipal-extension')
            warnings.push(
              `Prazo de ${deadline.original} prorrogado para ${deadline.date ?? 'conferência do primeiro dia letivo subsequente'} por feriado municipal ou recesso decorrente.${deadline.evidence.length ? ` Fontes institucionais: ${deadline.evidence.join('; ')}.` : ''}`,
            );
          if (deadline && (!deadline.date || event.end > deadline.date)) {
            const adjustment = event.deadlineAdjustment;
            if (!(
              requirement.admissionType === 'regular' &&
              adjustment &&
              event.end <= adjustment.date
            )) {
              issues.push(
                `Data posterior ao prazo de ${requirement.deadline}; confira eventual cronograma ajustado pela Proens.`,
              );
              return false;
            }
            warnings.push(
              'Prazo ajustado informado pelo campus; confira a autorização e o escopo na revisão.',
            );
          }
          if (
            requirement.month &&
            (Number(event.start.slice(5, 7)) !== requirement.month ||
              Number(event.end.slice(5, 7)) !== requirement.month)
          ) {
            issues.push('Confira o mês exigido.');
            return false;
          }
          return true;
        });
        if (requirement.minHours) {
          const hours = valid
            .filter((e) => temporalPosition(state, e) === 'current')
            .reduce((sum, e) => sum + (e.hours ?? 0), 0);
          if (hours < requirement.minHours)
            issues.push(`Registre pelo menos ${requirement.minHours} horas.`);
        }
        if (requirement.reviewInstruction && valid.length)
          warnings.push(requirement.reviewInstruction);
        if (applicability === 'unconfigured')
          warnings.push(
            requirement.intake
              ? 'Defina a configuração de ingresso por oferta e período.'
              : 'Escopo depende de norma própria ou classificação.',
          );
        const complete = valid.length > 0 && issues.length === 0;
        const coverage: Coverage = complete ? 'complete' : linked.length ? 'partial' : 'pending';
        const review: HumanReview = !requirement.reviewCriterionId
          ? 'unmapped'
          : humanReview?.current &&
              humanReview.reviewedCriterionIds.includes(requirement.reviewCriterionId)
            ? 'reviewed'
            : 'pending';
        // Rows follow the requirements, not the offers each date's generated activity reaches: a
        // linked date may be pending for this offer. A conflict prevails over a pending date.
        const classifications = linked.map((event) => links.forOffer(event.id, offer.id));
        const classification: Classification = classifications.includes('divergent')
          ? 'divergent'
          : classifications.includes('pending')
            ? 'pending'
            : 'compatible';
        return {
          requirement,
          offerId: offer.id,
          offer,
          classification,
          applicability,
          humanReview: review,
          coverage,
          /** Every date linked to the activity for this offer, including those under review. */
          events: linked,
          /** The linked dates that may be presented as evidence: compatible for this offer. */
          evidence: linked.filter((event) => links.forOffer(event.id, offer.id) === 'compatible'),
          issues,
          warnings,
          execution: executionOf(linked),
        };
      }),
  );
  return { rows, links };
}

export type PlanEvaluation = ReturnType<typeof evaluatePlan>;
export type ActivityEvaluation = PlanEvaluation['rows'][number];

/** Planning situation shown on one activity, summarised from its per-offer evaluation. */
export type ActivitySituation = 'pending' | 'partial' | 'complete' | 'optional' | 'unconfigured';

export const situationLabels: Record<ActivitySituation, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  complete: 'Completo',
  optional: 'Opcional',
  unconfigured: 'Aplicação a confirmar',
};

interface OfferEvaluation {
  applicability: Applicability;
  coverage: Coverage;
  issues: readonly string[];
  warnings: readonly string[];
}

/**
 * Required offers decide the situation; an activity with no required offer is optional or awaits
 * confirmation. `toConfirm` counts offers whose application is still open next to required ones.
 * Completion means dates were planned, never that compliance or execution was proven.
 */
export function activitySituation(rows: readonly OfferEvaluation[]) {
  const required = rows.filter((row) => row.applicability === 'required');
  const unconfigured = rows.filter((row) => row.applicability === 'unconfigured').length;
  const status: ActivitySituation = required.length
    ? required.every((row) => row.coverage === 'complete')
      ? 'complete'
      : required.every((row) => row.coverage === 'pending')
        ? 'pending'
        : 'partial'
    : unconfigured
      ? 'unconfigured'
      : 'optional';
  return {
    status,
    toConfirm: required.length ? unconfigured : 0,
    diverges: new Set(rows.map((row) => `${row.applicability}:${row.coverage}`)).size > 1,
    problems: rows.some((row) => row.issues.length > 0 || row.warnings.length > 0),
  };
}
