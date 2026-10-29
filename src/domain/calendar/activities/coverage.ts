import type { AssessmentSettings, CalendarActivity, CalendarPeriod } from '../model.ts';
import { appliesTo } from '../modalities.ts';
import { calendarOffers } from '../offers.ts';
import { policyFor } from '../../policies/registry.ts';
import { temporalPosition, validateActivityRecord } from './validation.ts';
import { periodsForModality } from '../organization/periods.ts';
import { prorogatedDeadline } from './deadlines.ts';
export function activityCoverage(
  state: AssessmentSettings & {
    year: number;
    periods: CalendarPeriod[];
    events: CalendarActivity[];
    weekdays?: number[];
    weekConfirmed?: boolean;
  },
  events: CalendarActivity[] = state.events,
  humanReview?: { current: boolean; reviewedCriterionIds: readonly string[] },
) {
  const policy = policyFor(state.year);
  return policy.requirements(state).flatMap((requirement) =>
    calendarOffers(state)
      .filter(
        (offer) =>
          !(requirement.offerId ?? requirement.modality) ||
          (requirement.offerId ?? requirement.modality) === offer.id,
      )
      .map((offer) => {
        const modality = offer.id;
        const applicability = policy.applicability(state, requirement, modality);
        const linked = events.filter(
          (event) => event.requirementId === requirement.id && appliesTo(event, modality),
        );
        const issues: string[] = [],
          warnings: string[] = [];
        const valid = linked.filter((event) => {
          if (
            policy.explicitRecordOffers &&
            !(state.offers ? event.offers : event.modalities)?.includes(modality)
          ) {
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
            const admission = event.admission;
            if (
              !admission ||
              admission.type !== requirement.admissionType ||
              !event.publicationStatus
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
              const period = admission.periodId
                ? periodsForModality(state, modality).find((p) => p.id === admission.periodId)
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
          modality,
          ...(state.offers ? { offerId: offer.id, offer } : {}),
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
            linked.length && linked.every((e) => e.publicationStatus === 'published')
              ? ('published' as const)
              : linked.some((e) => e.publicationStatus === 'planned')
                ? ('planned' as const)
                : ('unclassified' as const),
        };
      }),
  );
}
