import { calendarLimits } from '../config.ts';
import type { ActivityState, AssessmentSettings, CalendarEvent, CalendarPeriod } from '../model.ts';
import { parseDate } from '../../civil-date.ts';
import { offerFor } from '../offers.ts';
import { isAssessmentStage, sameActivity } from './activity-ref.ts';
import { assessmentIntervalIssue } from './assessment-intervals.ts';
import { policyFor } from '../../policies/registry.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { DomainError } from '../../errors.ts';
export function temporalPosition(
  state: Pick<ActivityState, 'year'>,
  event: Pick<CalendarEvent, 'start' | 'end'>,
) {
  const start = parseDate(event.start),
    end = parseDate(event.end);
  if (start > end) throw new DomainError('O término não pode ser anterior ao início.');
  const first = `${state.year}-01-01`,
    last = `${state.year}-12-31`;
  if (event.end > last) return event.start > last ? 'future' : 'future-crossing';
  return event.start > last
    ? 'future'
    : event.start < first
      ? event.end < first
        ? 'prior'
        : 'crossing'
      : 'current';
}
/**
 * Structural validation is shared by command/import/backend. It does not certify normative
 * coverage. Saving paths follow the link rule (`links.ts`): the stage interval is checked only on
 * edited dates, and a link kept without a generated activity is not re-evaluated.
 */
export function validateActivityRecord(
  state: AssessmentSettings & { year: number; periods?: CalendarPeriod[] },
  event: CalendarEvent,
  options: { stageInterval?: boolean; keptWithoutActivity?: boolean } = {},
) {
  const position = temporalPosition(state, event);
  if (!['include', 'exclude', 'note'].includes(event.effect))
    throw new DomainError('Efeito inválido.');
  if (
    event.deadlineExtensionCause !== undefined &&
    (!['municipal-holiday', 'municipal-recess'].includes(event.deadlineExtensionCause) ||
      event.effect !== 'exclude' ||
      position !== 'current')
  )
    throw new DomainError(
      'A prorrogação municipal exige feriado ou recesso decorrente e exclusão no ano.',
    );
  const notice = event.notice;
  if (notice?.publication !== undefined && !['planned', 'published'].includes(notice.publication))
    throw new DomainError('Situação de publicação inválida.');
  if (position === 'future' || position === 'future-crossing')
    throw new DomainError(
      'A ocorrência não pode ser inteiramente futura nem terminar depois do ano do calendário.',
    );
  const outOfYear = position !== 'current';
  if (outOfYear) {
    if (event.effect !== 'note')
      throw new DomainError(
        'Referências e ocorrências fora do ano são informativas, sem efeito letivo.',
      );
    if (
      event.hours !== undefined ||
      event.assessmentAutoStart ||
      /^teacher-vacation|^saturday/.test(event.id)
    )
      throw new DomainError(
        'Referência anterior não comprova horas, férias, sábados ou etapas atuais.',
      );
    const requirement = event.activity
      ? policyFor(state.year)
          .requirements(state)
          .find((r) => sameActivity(r.activity, event.activity))
      : undefined;
    if (event.activity && !options.keptWithoutActivity && !requirement?.acceptsPriorReference)
      throw new DomainError('Esta atividade não aceita referência anterior ou datas fora do ano.');
  }
  if (notice?.admission) {
    const a = notice.admission;
    if (
      !['regular', 'transfer'].includes(a.type) ||
      !['annual', 'first', 'second'].includes(a.term) ||
      !Number.isInteger(a.year) ||
      a.year < calendarLimits.minimumYear ||
      a.year > calendarLimits.maximumYear
    )
      throw new DomainError('Finalidade de ingresso inválida.');
    if (event.effect !== 'note')
      throw new DomainError('Publicação de edital é um registro informativo.');
    if (!notice.publication)
      throw new DomainError('Informe se a publicação é programada ou realizada.');
    if (
      !Array.isArray(a.destinations) ||
      a.destinations.some(
        (destination) =>
          typeof destination.offerId !== 'string' ||
          typeof destination.periodId !== 'string' ||
          !destination.periodId ||
          destination.periodId.length > 100,
      ) ||
      new Set(a.destinations.map((destination) => destination.offerId)).size !==
        a.destinations.length
    )
      throw new DomainError('Período de ingresso inválido.');
    // Removed or incompatible periods remain as unresolved evidence (`noticeDestinationIssues`)
    // instead of being dropped or reassigned.
  }
  if (isAssessmentStage(event.activity) && state.periods && options.stageInterval !== false) {
    const modality = event.activity.offerId;
    const offer = offerFor(state, modality);
    if (!offer) throw new DomainError('A oferta da etapa de avaliação não pertence ao calendário.');
    const issue = assessmentIntervalIssue(
      periodsForOffer({ ...state, periods: state.periods }, modality),
      event.start,
      event.end,
    );
    if (issue) throw new DomainError(issue);
  }
  if (event.effect === 'include' && state.periods) {
    const scope = event.offers;
    for (let time = parseDate(event.start); time <= parseDate(event.end); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      if (
        scope.some(
          (modality) =>
            !periodsForOffer({ ...state, periods: state.periods ?? [] }, modality).some(
              (period) => period.start <= date && period.end >= date,
            ),
        )
      )
        throw new DomainError(
          'O dia letivo acrescentado precisa estar dentro de um período letivo da oferta.',
        );
    }
  }
  if (event.deadlineAdjustment) {
    parseDate(event.deadlineAdjustment.date);
    if (notice?.admission?.type !== 'regular')
      throw new DomainError('Ajuste de prazo exige edital regular e data válida.');
  }
  if (notice?.publication && !notice.admission && event.activity?.activityId === 'admission-notice')
    throw new DomainError('Identifique a finalidade de ingresso do edital.');
}

/** Destination period of one offer in the notice of a date, when informed. */
export const admissionDestination = (event: Pick<CalendarEvent, 'notice'>, offerId: string) =>
  event.notice?.admission?.destinations.find((destination) => destination.offerId === offerId)
    ?.periodId;

export type NoticeDestinationProblem = 'missing' | 'orphan' | 'unassociated' | 'other-term';

export interface NoticeDestinationIssue {
  offerId: string;
  periodId?: string;
  problem: NoticeDestinationProblem;
  message: string;
}

const termNames = { annual: 'ciclo anual', first: '1º semestre', second: '2º semestre' } as const;

/**
 * Diagnosis of the admission destination by offer of the date. Nothing is
 * corrected here: a removed period, a period of another offer or cycle, or an offer left without
 * destination while others have one is reported for the campus to review. A notice without
 * destinations (not informed) has no issue.
 */
export function noticeDestinationIssues(
  state: AssessmentSettings & { periods: CalendarPeriod[] },
  event: Pick<CalendarEvent, 'notice' | 'offers'>,
): NoticeDestinationIssue[] {
  const admission = event.notice?.admission;
  if (!admission?.destinations.length) return [];
  return event.offers.flatMap((offerId): NoticeDestinationIssue[] => {
    const periodId = admissionDestination(event, offerId);
    if (periodId === undefined)
      return [
        { offerId, problem: 'missing', message: 'destino de ingresso não informado para a oferta' },
      ];
    const period = state.periods.find((item) => item.id === periodId);
    if (!period)
      return [
        {
          offerId,
          periodId,
          problem: 'orphan',
          message: `período de destino removido do calendário (${periodId})`,
        },
      ];
    if (!periodsForOffer(state, offerId).some((item) => item.id === periodId))
      return [
        {
          offerId,
          periodId,
          problem: 'unassociated',
          message: `período de destino “${period.name ?? periodId}” não está associado à oferta`,
        },
      ];
    if (period.association.term !== admission.term)
      return [
        {
          offerId,
          periodId,
          problem: 'other-term',
          message: `período de destino “${period.name ?? periodId}” é do ${termNames[period.association.term]}, não do ${termNames[admission.term]} do ingresso`,
        },
      ];
    return [];
  });
}
