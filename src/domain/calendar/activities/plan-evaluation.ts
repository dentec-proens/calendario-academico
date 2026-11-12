import { longDate } from '../../date-labels.ts';
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
import { deadlineStanding, requirementDeadline } from './deadlines.ts';
import { exactDaysIssue } from './vacations.ts';
import type { ActivityRef } from './activity-ref.ts';
import type { CheckId, RowFinding } from '../checks.ts';
import { DomainError } from '../../errors.ts';
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
 * - coverage: whether the dates plan the activity (dates, hours, offers);
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
  pending: 'Atividade não gerada',
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
  !issue ? 'compatible' : issue === 'not-generated' ? 'pending' : 'divergent';

/** The classification of one linked date for one offer of the date. */
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
    for (const offerId of event.offers) {
      const reaches = row !== undefined && coversDate(state, row, { offers: [offerId] });
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
    /** Every linked date × offer the date lists. */
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
        const issues: RowFinding[] = [],
          warnings: RowFinding[] = [],
          reviewNotes: RowFinding[] = [];
        const found = (list: RowFinding[], check: CheckId, detail: string, eventId?: string) =>
          list.push({ check, detail, ...(eventId ? { eventId } : {}) });
        const valid = linked.filter((event) => {
          const reason = links.issues.get(event.id);
          // The date blocks the conclusion once, by its own readiness issue (`readiness.ts`); the
          // row only warns, so the same date is not counted again for each of its offers.
          if (reason) {
            found(
              warnings,
              'link-review-row',
              `${linkIssueLabels[reason]}: ${linkIssueActions[reason]}`,
              event.id,
            );
            return false;
          }
          // A date whose generated activity does not reach this offer is pending for it: it never
          // counts as fulfilment here, even when it fits another offer of the date.
          if (links.forOffer(event.id, offer.id) !== 'compatible') {
            found(
              warnings,
              'link-not-generated',
              `${linkIssueLabels['not-generated']}: ${linkIssueActions['not-generated']}`,
              event.id,
            );
            return false;
          }
          try {
            validateActivityRecord(state, event);
          } catch (error) {
            // A rule the campus can correct; anything else is a fault of the system, not theirs.
            if (error instanceof DomainError)
              found(issues, 'activity-record', error.message, event.id);
            else
              found(
                issues,
                'system-error',
                `Erro do sistema ao conferir a data (${error instanceof Error ? error.message : String(error)}). Avise a administração.`,
                event.id,
              );
            return false;
          }
          if (requirement.admissionType) {
            const admission = event.notice?.admission;
            if (
              !admission ||
              admission.type !== requirement.admissionType ||
              !event.notice?.publication
            ) {
              found(
                issues,
                'admission-classification',
                'Classificação de ingresso a conferir.',
                event.id,
              );
              return false;
            }
            const expectedYear =
              requirement.admissionType === 'regular' ? state.year + 1 : state.year;
            if (
              admission.year !== expectedYear ||
              (requirement.term && admission.term !== requirement.term)
            ) {
              found(
                issues,
                'admission-purpose',
                'Finalidade de ingresso incompatível com o requisito.',
                event.id,
              );
              return false;
            }
            if (admission.type === 'transfer') {
              // Each offer is checked against its own destination.
              const periodId = admissionDestination(event, modality);
              const period = periodId
                ? periodsForOffer(state, modality).find((p) => p.id === periodId)
                : undefined;
              if (!period || period.association.term !== admission.term) {
                found(
                  issues,
                  'admission-destination',
                  'Escolha um período de ingresso desta oferta. Um edital tem um só destino para todas as suas ofertas: se elas têm períodos diferentes, registre um edital para cada oferta.',
                  event.id,
                );
                return false;
              }
              if (event.end >= period.start) {
                found(
                  issues,
                  'admission-before-period',
                  'Publique antes do início do período letivo de destino.',
                  event.id,
                );
                return false;
              }
            }
          }
          const deadline = requirementDeadline(state, requirement, events, modality);
          if (deadline?.source === 'municipal-extension')
            found(
              reviewNotes,
              'deadline-extended',
              `Prazo de ${longDate(deadline.original)} prorrogado para ${deadline.date ? longDate(deadline.date) : 'conferência do primeiro dia letivo subsequente'} por feriado municipal ou recesso decorrente.${deadline.evidence.length ? ` Fontes institucionais: ${deadline.evidence.join('; ')}.` : ''}`,
              event.id,
            );
          const standing = deadlineStanding(requirement, deadline, event);
          if (standing === 'late') {
            found(
              issues,
              'deadline-late',
              requirement.admissionType === 'regular'
                ? `Data posterior ao prazo de ${longDate(requirement.deadline!)}. Antecipe a data ou, se a Proens definiu outro prazo para o campus, informe-o em “Novo prazo definido pela Proens”.`
                : `Data posterior ao prazo de ${longDate(requirement.deadline!)}. Antecipe a data para até o prazo.`,
              event.id,
            );
            return false;
          }
          if (standing === 'adjusted')
            found(
              reviewNotes,
              'deadline-adjusted',
              'Prazo ajustado informado pelo campus; confira a autorização e o escopo na revisão.',
              event.id,
            );
          if (
            requirement.month &&
            (Number(event.start.slice(5, 7)) !== requirement.month ||
              Number(event.end.slice(5, 7)) !== requirement.month)
          ) {
            found(issues, 'month', 'Confira o mês exigido.', event.id);
            return false;
          }
          return true;
        });
        // Like the exact days, a minimum the norm does not ask of this offer is not counted here.
        if (requirement.minHours && applicability === 'required') {
          const hours = valid
            .filter((e) => temporalPosition(state, e) === 'current')
            .reduce((sum, e) => sum + (e.hours ?? 0), 0);
          if (hours < requirement.minHours)
            found(issues, 'min-hours', `Registre pelo menos ${requirement.minHours} horas.`);
        }
        // A row outside the norm's requirement stays a record: nothing to add up to.
        const exactDays = applicability === 'required' && exactDaysIssue(requirement, valid);
        if (exactDays) found(issues, 'exact-days', exactDays);
        if (requirement.reviewInstruction && valid.length)
          found(reviewNotes, 'review-instruction', requirement.reviewInstruction);
        if (applicability === 'unconfigured')
          found(
            warnings,
            'applicability-unconfigured',
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
          /**
           * What the human review confirms about a date that already counts: never a pending item
           * of the plan, since the campus has nothing left to fill, but still a readiness notice.
           */
          reviewNotes,
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
  issues: readonly RowFinding[];
  warnings: readonly RowFinding[];
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
