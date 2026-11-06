/** Days that an `exclude` date takes out of the school days, with the names that explain why. */
export type ExcludedDays = ReadonlyMap<string, readonly string[]>;

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function excludedDays(
  events: readonly { name: string; start: string; end: string; effect?: string }[],
): ExcludedDays {
  const days = new Map<string, string[]>();
  for (const event of events) {
    if (event.effect !== 'exclude') continue;
    for (let date = event.start; date <= event.end; date = nextDay(date)) {
      const names = days.get(date);
      if (!names) days.set(date, [event.name]);
      else if (!names.includes(event.name)) names.push(event.name);
    }
  }
  return days;
}

export interface ExcludedRun {
  start: string;
  end: string;
  names: readonly string[];
}

/** Consecutive days with the same reasons read as one line, so a recess is not a list of days. */
export function groupExcludedDays(
  days: readonly { date: string; names: readonly string[] }[],
): ExcludedRun[] {
  const runs: ExcludedRun[] = [];
  for (const { date, names } of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!names.length) continue;
    const last = runs.at(-1);
    if (last && nextDay(last.end) === date && last.names.join('\n') === names.join('\n'))
      last.end = date;
    else runs.push({ start: date, end: date, names });
  }
  return runs;
}

/** The days of a run within its month: "7" or "4 a 20". */
export function runDays({ start, end }: Pick<ExcludedRun, 'start' | 'end'>) {
  const day = (date: string) => String(Number(date.slice(8)));
  return start === end ? day(start) : `${day(start)} a ${day(end)}`;
}
