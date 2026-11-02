import type { AssessmentSettings, CalendarEvent, CalendarPeriod } from '../model.ts';
import { offerFor, stageOrdinal, stageTerm } from '../offers.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { isAssessmentStage } from './activity-ref.ts';
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
  state: AssessmentSettings & { periods: CalendarPeriod[]; events?: CalendarEvent[] },
  event: CalendarEvent,
): string | undefined {
  if (!isAssessmentStage(event.activity)) return undefined;
  const id = event.activity.offerId;
  const offer = offerFor(state, id);
  if (!offer) return 'A oferta da etapa de avaliação não pertence ao calendário.';
  const ordinal = stageOrdinal(offer, event.activity.position);
  const term = ordinal === undefined ? undefined : stageTerm(offer, ordinal);
  if (ordinal === undefined || !term)
    return 'Defina a organização e a quantidade de etapas da oferta.';
  const periods = periodsForOffer(state, id).filter(
    (period) => period.association?.status === 'defined' && period.association.term === term,
  );
  if (assessmentIntervalIssue(periods, event.start, event.end))
    return `A etapa de avaliação deve estar inteiramente dentro do período do ${termLabels[term]} da oferta.`;
  for (const other of state.events ?? []) {
    if (
      other.id === event.id ||
      !isAssessmentStage(other.activity) ||
      other.activity.offerId !== id
    )
      continue;
    const otherOrdinal = stageOrdinal(offer, other.activity.position);
    if (otherOrdinal === undefined || stageTerm(offer, otherOrdinal) !== term) continue;
    if (otherOrdinal === ordinal) return 'Há etapas de avaliação duplicadas para a mesma oferta.';
    if (
      (otherOrdinal < ordinal && other.end >= event.start) ||
      (otherOrdinal > ordinal && other.start <= event.end)
    )
      return 'As etapas de avaliação da oferta devem ocorrer em sequência, sem sobreposição dentro de cada ciclo.';
  }
  return undefined;
}
