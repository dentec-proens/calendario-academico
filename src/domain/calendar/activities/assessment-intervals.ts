import type { AssessmentSettings, CalendarActivity, CalendarPeriod } from '../model.ts';
import { offerFor, stageTerm } from '../offers.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { isStageRequirementId } from './metadata.ts';
import { termLabels } from '../config.ts';

/** An assessment stage belongs entirely to one teaching period, including both endpoints. */
export function assessmentIntervalIssue(
  periods: readonly Pick<CalendarPeriod, 'start' | 'end'>[],
  start: string,
  end: string,
) {
  if (start > end) return 'O término da etapa deve ser igual ou posterior ao início.';
  if (!periods.some((period) => period.start <= start && end <= period.end))
    return 'A etapa de avaliação deve estar inteiramente dentro de um período letivo da oferta.';
  return '';
}

/** New edits must fit their own cycle. Existing migrated records remain saveable as evidence. */
export function assessmentCycleIssue(
  state: AssessmentSettings & { periods: CalendarPeriod[]; events?: CalendarActivity[] },
  event: CalendarActivity,
): string | undefined {
  if (!isStageRequirementId(event.requirementId)) return undefined;
  const [stage, id] = event.requirementId!.split(':');
  const offer = offerFor(state, id);
  if (!offer) return 'A oferta da etapa de avaliação não pertence ao calendário.';
  const ordinal = Number(stage.slice('stage-'.length));
  const term = stageTerm(offer, ordinal);
  if (!term) return 'Defina a organização e a quantidade de etapas da oferta.';
  const periods = periodsForOffer(state, id).filter(
    (period) => period.association?.status === 'defined' && period.association.term === term,
  );
  if (assessmentIntervalIssue(periods, event.start, event.end))
    return `A etapa de avaliação deve estar inteiramente dentro do período do ${termLabels[term]} da oferta.`;
  for (const other of state.events ?? []) {
    if (
      other.id === event.id ||
      !isStageRequirementId(other.requirementId) ||
      !other.requirementId?.endsWith(`:${id}`)
    )
      continue;
    const otherOrdinal = Number(other.requirementId.split(':')[0].slice('stage-'.length));
    if (stageTerm(offer, otherOrdinal) !== term) continue;
    if (otherOrdinal === ordinal) return 'Há etapas de avaliação duplicadas para a mesma oferta.';
    if (
      (otherOrdinal < ordinal && other.end >= event.start) ||
      (otherOrdinal > ordinal && other.start <= event.end)
    )
      return 'As etapas de avaliação da oferta devem ocorrer em sequência, sem sobreposição dentro de cada ciclo.';
  }
  return undefined;
}
