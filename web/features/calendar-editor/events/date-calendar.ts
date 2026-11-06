/** A calendar day as a civil date, in the local time zone that the day picker works in. */
export function isoDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/**
 * A first click marks a single day, the most common date. A later day then closes the range, and
 * any other click starts again, so a range never has to be undone before choosing another.
 */
export function nextDateRange(current: { start: string; end: string }, day: string) {
  return current.start && current.start === current.end && day > current.start
    ? { start: current.start, end: day }
    : { start: day, end: day };
}

/**
 * The month to move to after the form's dates change, if any: the one of the date that changed. A
 * year being typed passes through 0002, 0020 and 0202, which do not count yet; a day clicked in the
 * month on screen changes nothing.
 */
export function monthAfterChange(
  previous: { start: string; end: string },
  next: { start: string; end: string },
  shown: Date,
  periods: readonly { start: string }[],
  year: number,
) {
  if (!next.start && !next.end) return initialMonth('', periods, year);
  const changed = next.start === previous.start ? next.end : next.start;
  const date = localDate(changed);
  if (!date || changed.startsWith('0')) return undefined;
  return date.getFullYear() === shown.getFullYear() && date.getMonth() === shown.getMonth()
    ? undefined
    : date;
}

/** The month the calendar opens on: the date in the form, else the start of the school year. */
export function initialMonth(start: string, periods: readonly { start: string }[], year: number) {
  const first = periods
    .map((period) => period.start)
    .sort()
    .at(0);
  return localDate(start) ?? (first ? localDate(first) : undefined) ?? new Date(year, 0, 1);
}
