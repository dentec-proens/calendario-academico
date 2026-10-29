import type { VacationPeriods } from '../model.ts';
import { datesBetween } from '../counting/core.ts';
import { DomainError } from '../../errors.ts';

export function teacherVacations(year: number, periodsInput: Partial<VacationPeriods>) {
  const { firstStart, firstEnd, secondStart, secondEnd, thirdStart, thirdEnd } = periodsInput;
  const periods: [string | undefined, string | undefined][] = [[firstStart, firstEnd]];
  if (secondStart || secondEnd) periods.push([secondStart, secondEnd]);
  if (thirdStart || thirdEnd) {
    if (!secondStart || !secondEnd)
      throw new DomainError('Preencha o segundo período antes do terceiro.');
    periods.push([thirdStart, thirdEnd]);
  }
  const seen = new Set<string>();
  const events = periods.map(([start, end], i) => {
    if (!start || !end)
      throw new DomainError('Informe início e término de cada período de férias.');
    if (!String(start).startsWith(`${year}-`) || !String(end).startsWith(`${year}-`))
      throw new DomainError('As férias devem estar no ano do calendário.');
    const days = datesBetween(start, end);
    for (const d of days) {
      if (seen.has(d)) throw new DomainError('Os períodos de férias não podem se sobrepor.');
      seen.add(d);
    }
    return {
      id: `teacher-vacation-${['january', 'july', 'third'][i]}`,
      name: `Férias docentes — ${days.length} dias`,
      start,
      end,
      kind: 'exclude' as const,
      category: 'ferias',
    };
  });
  return {
    firstStart,
    firstEnd,
    secondStart,
    secondEnd,
    thirdStart,
    thirdEnd,
    events,
    total: seen.size,
  };
}
