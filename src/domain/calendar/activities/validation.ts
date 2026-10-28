import { calendarLimits } from '../config.ts';
import type {
  ActivityState,
  AssessmentSettings,
  CalendarActivity,
  CalendarPeriod,
} from '../model.ts';
import { parseDate } from '../counting/core.ts';
import { calendarModalities } from '../modalities.ts';
import { isStageRequirementId } from './metadata.ts';
import { assessmentIntervalIssue } from './assessment-intervals.ts';
import { requirements2027 } from '../policies/consup-292-2027.ts';
import { periodsForModality } from '../organization/periods.ts';
export function temporalPosition(
  state: Pick<ActivityState, 'year'>,
  event: Pick<CalendarActivity, 'start' | 'end'>,
) {
  const start = parseDate(event.start),
    end = parseDate(event.end);
  if (start > end) throw new Error('Intervalo invertido.');
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
  if (!['include', 'exclude', 'note'].includes(event.kind)) throw new Error('Efeito inválido.');
  if (
    event.deadlineExtensionCause !== undefined &&
    (!['municipal-holiday', 'municipal-recess'].includes(event.deadlineExtensionCause) ||
      event.kind !== 'exclude' ||
      position !== 'current')
  )
    throw new Error(
      'A prorrogação municipal exige feriado ou recesso decorrente e exclusão no ano.',
    );
  if (
    event.recordType !== undefined &&
    !['event', 'prior-reference', 'retired-stage'].includes(event.recordType)
  )
    throw new Error('Natureza do registro inválida.');
  if (event.recordType === 'retired-stage' && (event.kind !== 'note' || event.requirementId))
    throw new Error(
      'Uma etapa desvinculada deve permanecer informativa e sem vínculo de atividade.',
    );
  if (
    event.publicationStatus !== undefined &&
    !['planned', 'published'].includes(event.publicationStatus)
  )
    throw new Error('Situação de publicação inválida.');
  if (position === 'future' || position === 'future-crossing')
    throw new Error(
      'A ocorrência não pode ser inteiramente futura nem terminar depois do ano do calendário.',
    );
  if (event.recordType === 'prior-reference' && event.publicationStatus === 'planned')
    throw new Error(
      'Referência anterior exige ocorrência comprovada; uma previsão é atividade de planejamento.',
    );
  if (event.recordType === 'prior-reference' && !['prior', 'crossing'].includes(position))
    throw new Error('A referência anterior deve começar antes do ano do calendário.');
  const outOfYear = position !== 'current';
  if (outOfYear || event.recordType === 'prior-reference') {
    if (event.kind !== 'note')
      throw new Error('Referências e ocorrências fora do ano são informativas, sem efeito letivo.');
    if (
      event.hours !== undefined ||
      event.days !== undefined ||
      event.assessmentAutoStart ||
      /^teacher-vacation|^saturday/.test(event.id)
    )
      throw new Error('Referência anterior não comprova horas, férias, sábados ou etapas atuais.');
    const requirement = event.requirementId
      ? requirements2027(state).find((r) => r.id === event.requirementId)
      : undefined;
    if (event.requirementId && !(state.year === 2027 && requirement?.acceptsPriorReference))
      throw new Error('Esta atividade não aceita referência anterior ou datas fora do ano.');
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
      throw new Error('Finalidade de ingresso inválida.');
    if (event.kind !== 'note') throw new Error('Publicação de edital é um registro informativo.');
    if (!event.publicationStatus)
      throw new Error('Informe se a publicação é prevista ou realizada.');
    if (event.recordType === 'prior-reference' && event.publicationStatus !== 'published')
      throw new Error('Referência anterior exige publicação realizada com fonte.');
    if (a.periodId && (typeof a.periodId !== 'string' || a.periodId.length > 100))
      throw new Error('Período de ingresso inválido.');
    // Deleted periods remain visible as unresolved evidence instead of being reassigned.
  }
  if (isStageRequirementId(event.requirementId) && state.periods) {
    const modality = event.requirementId!.split(':')[1];
    const issue = assessmentIntervalIssue(
      periodsForModality({ ...state, periods: state.periods }, modality),
      event.start,
      event.end,
    );
    if (issue) throw new Error(issue);
  }
  if (event.kind === 'include' && state.periods) {
    const scope = event.modalities?.length ? event.modalities : calendarModalities(state);
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
        throw new Error('Inclusões letivas devem estar dentro dos períodos cadastrados da oferta.');
    }
  }
  if (event.deadlineAdjustment) {
    parseDate(event.deadlineAdjustment.date);
    if (
      !event.admission ||
      event.admission.type !== 'regular' ||
      typeof event.deadlineAdjustment.reviewed !== 'boolean'
    )
      throw new Error(
        'Ajuste de prazo exige edital regular, data válida e indicação de conferência.',
      );
  }
  if (
    event.publicationStatus &&
    !event.admission &&
    event.requirementId?.startsWith('admission-notice')
  )
    throw new Error('Identifique a finalidade de ingresso do edital.');
}
