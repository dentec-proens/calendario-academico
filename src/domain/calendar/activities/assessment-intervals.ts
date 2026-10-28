import type { CalendarPeriod } from '../model.ts';

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
