const calendarDate = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const calendarDayMonth = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** Calendar dates have no time of day; UTC preserves the recorded day in every timezone. */
export function dateRangeLabel(start: string, end: string) {
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (start === end) return calendarDate.format(first);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${first.getUTCDate()} a ${calendarDate.format(last)}`;
  if (start.slice(0, 4) === end.slice(0, 4))
    return `${calendarDayMonth.format(first)} a ${calendarDate.format(last)}`;
  return `${calendarDate.format(first)} a ${calendarDate.format(last)}`;
}

export function updatedLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Data não disponível';
}
