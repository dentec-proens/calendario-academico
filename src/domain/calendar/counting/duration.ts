import { civilDate, parseDate } from '../../civil-date.ts';
import { calendarLimits } from '../config.ts';
import { DomainError } from '../../errors.ts';

export function durationEnd(start: string, quantity: number | string) {
  const count = Number(quantity),
    time = parseDate(start);
  if (
    !Number.isInteger(count) ||
    count < calendarLimits.minimumTargetDays ||
    count > calendarLimits.maximumTargetDays
  )
    throw new DomainError(
      `Informe uma quantidade inteira entre ${calendarLimits.minimumTargetDays} e ${calendarLimits.maximumTargetDays} dias.`,
    );
  return civilDate(new Date(time + (count - 1) * 86400000).toISOString().slice(0, 10));
}
