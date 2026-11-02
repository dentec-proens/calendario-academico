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
import { linkIssueActions, linkIssueLabels, linkedTo, linksToReview } from './links.ts';
export function activityCoverage(
  state: AssessmentSettings & {
    year: number;
    periods: CalendarPeriod[];
    events: CalendarEvent[];
    weekdays?: number[];
    weekConfirmed?: boolean;
  },
  events: readonly ProjectedDate[] = state.events,
  humanReview?: { current: boolean; reviewedCriterionIds: readonly string[] },
) {
  const policy = policyFor(state.year);
  // Only local dates carry activity links; institutional dates still prorogate deadlines.
  const local = events.filter(isLocalDate);
  const review = linksToReview({ ...state, events: local });
  return policy.requirements(state).flatMap((requirement) =>
    calendarOffers(state)
      .filter((offer) => !requirement.offerId || requirement.offerId === offer.id)
      .map((offer) => {
        const modality = offer.id;
        const applicability = policy.applicability(state, requirement, offer);
        const linked = local.filter(
          (event) => linkedTo(event, requirement) && appliesTo(event, offer),
        );
        const issues: string[] = [],
          warnings: string[] = [];
        const valid = linked.filter((event) => {
          const reason = review.get(event.id);
          // Until the link can be corrected in the editor, review reasons warn without blocking.
          if (reason) {
            warnings.push(`${linkIssueLabels[reason]}: ${linkIssueActions[reason]}`);
            return false;
          }
          // Under explicit offers (2027), only a scope the campus confirmed counts (plan, 5.3).
          if (policy.explicitRecordOffers && !event.scope.confirmed) {
            // Same text as format 4, so the frozen oracle of coverage stays equal.
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
              // Each offer is checked against its own destination (plan, section 5.4).
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
        return {
          requirement,
          offerId: offer.id,
          offer,
          applicability,
          humanReview: !requirement.reviewCriterionId
            ? ('unmapped' as const)
            : humanReview?.current &&
                humanReview.reviewedCriterionIds.includes(requirement.reviewCriterionId)
              ? ('reviewed' as const)
              : ('pending' as const),
          coverage: complete
            ? ('complete' as const)
            : linked.length
              ? ('partial' as const)
              : ('pending' as const),
          events: linked,
          issues,
          warnings,
          execution:
            linked.length && linked.every((e) => e.notice?.publication === 'published')
              ? ('published' as const)
              : linked.some((e) => e.notice?.publication === 'planned')
                ? ('planned' as const)
                : ('unclassified' as const),
        };
      }),
  );
}
