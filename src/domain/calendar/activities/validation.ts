import { calendarLimits } from '../config.ts';
import type {
  ActivityState,
  AssessmentSettings,
  CalendarActivity,
  CalendarPeriod,
} from '../model.ts';
import { parseDate } from '../counting/core.ts';
import { calendarModalities } from '../modalities.ts';
import { offerFor, offerIds } from '../offers.ts';
import { isStageRequirementId } from './metadata.ts';
import { assessmentIntervalIssue } from './assessment-intervals.ts';
import { policyFor } from '../../policies/registry.ts';
import { periodsForModality } from '../organization/periods.ts';
import { DomainError } from '../../errors.ts';
export function temporalPosition(
  state: Pick<ActivityState, 'year'>,
  event: Pick<CalendarActivity, 'start' | 'end'>,
) {
  const start = parseDate(event.start),
    end = parseDate(event.end);
  if (start > end) throw new DomainError('Intervalo invertido.');
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
/** Structural validation is shared by command/import/backend. It does not certify normative coverage. */
export function validateActivityRecord(
  state: AssessmentSettings & { year: number; periods?: CalendarPeriod[] },
  event: CalendarActivity,
) {
  const position = temporalPosition(state, event);
  if (!['include', 'exclude', 'note'].includes(event.kind))
    throw new DomainError('Efeito inválido.');
  if (
    event.deadlineExtensionCause !== undefined &&
    (!['municipal-holiday', 'municipal-recess'].includes(event.deadlineExtensionCause) ||
      event.kind !== 'exclude' ||
      position !== 'current')
  )
    throw new DomainError(
      'A prorrogação municipal exige feriado ou recesso decorrente e exclusão no ano.',
    );
  if (
    event.recordType !== undefined &&
    !['event', 'prior-reference', 'retired-stage'].includes(event.recordType)
  )
    throw new DomainError('Natureza do registro inválida.');
  if (event.recordType === 'retired-stage' && (event.kind !== 'note' || event.requirementId))
    throw new DomainError(
      'Uma etapa desvinculada deve permanecer informativa e sem vínculo de atividade.',
    );
  if (
    event.publicationStatus !== undefined &&
    !['planned', 'published'].includes(event.publicationStatus)
  )
    throw new DomainError('Situação de publicação inválida.');
  if (position === 'future' || position === 'future-crossing')
    throw new DomainError(
      'A ocorrência não pode ser inteiramente futura nem terminar depois do ano do calendário.',
    );
  if (event.recordType === 'prior-reference' && event.publicationStatus === 'planned')
    throw new DomainError(
      'Referência anterior exige ocorrência comprovada; uma previsão é atividade de planejamento.',
    );
  if (event.recordType === 'prior-reference' && !['prior', 'crossing'].includes(position))
    throw new DomainError('A referência anterior deve começar antes do ano do calendário.');
  const outOfYear = position !== 'current';
  if (outOfYear || event.recordType === 'prior-reference') {
    if (event.kind !== 'note')
      throw new DomainError(
        'Referências e ocorrências fora do ano são informativas, sem efeito letivo.',
      );
    if (
      event.hours !== undefined ||
      event.days !== undefined ||
      event.assessmentAutoStart ||
      /^teacher-vacation|^saturday/.test(event.id)
    )
      throw new DomainError(
        'Referência anterior não comprova horas, férias, sábados ou etapas atuais.',
      );
    const requirement = event.requirementId
      ? policyFor(state.year)
          .requirements(state)
          .find((r) => r.id === event.requirementId)
      : undefined;
    if (event.requirementId && !requirement?.acceptsPriorReference)
      throw new DomainError('Esta atividade não aceita referência anterior ou datas fora do ano.');
  }
  if (event.admission) {
    const a = event.admission;
    if (
      !['regular', 'transfer'].includes(a.type) ||
      !['annual', 'first', 'second'].includes(a.term) ||
      !Number.isInteger(a.year) ||
      a.year < calendarLimits.minimumYear ||
      a.year > calendarLimits.maximumYear
    )
      throw new DomainError('Finalidade de ingresso inválida.');
    if (event.kind !== 'note')
      throw new DomainError('Publicação de edital é um registro informativo.');
    if (!event.publicationStatus)
      throw new DomainError('Informe se a publicação é prevista ou realizada.');
    if (event.recordType === 'prior-reference' && event.publicationStatus !== 'published')
      throw new DomainError('Referência anterior exige publicação realizada com fonte.');
    if (a.periodId && (typeof a.periodId !== 'string' || a.periodId.length > 100))
      throw new DomainError('Período de ingresso inválido.');
    // Deleted periods remain visible as unresolved evidence instead of being reassigned.
  }
  if (isStageRequirementId(event.requirementId) && state.periods) {
    const modality = event.requirementId!.split(':')[1];
    const offer = state.offers ? offerFor(state, modality) : undefined;
    if (state.offers && !offer)
      throw new DomainError('A oferta da etapa de avaliação não pertence ao calendário.');
    const issue =
      offer?.organization === 'a-classificar'
        ? ''
        : assessmentIntervalIssue(
            periodsForModality({ ...state, periods: state.periods }, modality),
            event.start,
            event.end,
          );
    if (issue) throw new DomainError(issue);
  }
  if (event.kind === 'include' && state.periods) {
    const declared = event.offers ?? event.modalities;
    const scope = declared?.length
      ? declared
      : state.offers
        ? offerIds(state)
        : calendarModalities(state);
    for (let time = parseDate(event.start); time <= parseDate(event.end); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      if (
        scope.some(
          (modality) =>
            !periodsForModality({ ...state, periods: state.periods ?? [] }, modality).some(
              (period) => period.start <= date && period.end >= date,
            ),
        )
      )
        throw new DomainError(
          'Inclusões letivas devem estar dentro dos períodos cadastrados da oferta.',
        );
    }
  }
  if (event.deadlineAdjustment) {
    parseDate(event.deadlineAdjustment.date);
    if (
      !event.admission ||
      event.admission.type !== 'regular' ||
      typeof event.deadlineAdjustment.reviewed !== 'boolean'
    )
      throw new DomainError(
        'Ajuste de prazo exige edital regular, data válida e indicação de conferência.',
      );
  }
  if (
    event.publicationStatus &&
    !event.admission &&
    event.requirementId?.startsWith('admission-notice')
  )
    throw new DomainError('Identifique a finalidade de ingresso do edital.');
}
