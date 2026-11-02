import { type CivilDate } from '../../civil-date.ts';
import type { CalendarEvent, VacationPeriods } from '../model.ts';
import { datesBetween } from '../counting/core.ts';
import { DomainError } from '../../errors.ts';

export function teacherVacations(year: number, periodsInput: Partial<VacationPeriods>) {
  const { firstStart, firstEnd, secondStart, secondEnd, thirdStart, thirdEnd } = periodsInput;
  const periods: [CivilDate | undefined, CivilDate | undefined][] = [[firstStart, firstEnd]];
  if (secondStart || secondEnd) periods.push([secondStart, secondEnd]);
  if (thirdStart || thirdEnd) {
    if (!secondStart || !secondEnd)
      throw new DomainError('Preencha o segundo período antes do terceiro.');
    periods.push([thirdStart, thirdEnd]);
  }
  const seen = new Set<CivilDate>();
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
      effect: 'exclude' as const,
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

/**
 * Vacation dates regenerated from the periods (`teacherVacations`). They reach every current offer,
 * since vacations hold for all of them, and keep the link and the confirmation recorded for the
 * same date ID (`confirmed: false` for a new one); this is the documented exception to “adding an
 * offer never extends a scope” (plan, section 5.3). Later entries of `recorded` win; a link is
 * never lost because a later entry lacks it.
 */
export function regeneratedVacations(
  generated: ReturnType<typeof teacherVacations>['events'],
  offers: readonly string[],
  recorded: readonly Pick<CalendarEvent, 'id' | 'activity' | 'scope'>[],
): CalendarEvent[] {
  const links = new Map<string, NonNullable<CalendarEvent['activity']>>();
  const confirmed = new Map<string, boolean>();
  for (const event of recorded) {
    if (event.activity) links.set(event.id, event.activity);
    if (event.scope) confirmed.set(event.id, event.scope.confirmed);
  }
  return generated.map((event) => {
    const activity = links.get(event.id);
    return {
      ...event,
      ...(activity ? { activity } : {}),
      scope: { offers: [...offers], confirmed: confirmed.get(event.id) ?? false },
    };
  });
}
