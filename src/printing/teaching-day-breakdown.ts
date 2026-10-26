import type { DateRange } from '../domain-types.ts';
import type { PrintState, PrintResult, PrintEvent, DistributionRow } from './types.ts';
import { appliesTo } from '../modalities.ts';

export function teachingDayBreakdown(
  state: PrintState,
  events: PrintEvent[],
  result: PrintResult,
  modality: string,
) {
  const scoped = result?.byModality ? result.byModality[modality] : result;
  const ledger = scoped?.ledger;
  const row = (label: string, range: DateRange | null): DistributionRow => {
    const available = !!ledger && !!range && range.start <= range.end;
    const byWeekday: number[] = Array<number>(7).fill(0);
    if (available)
      for (const day of ledger)
        if (day.counted && day.date >= range.start && day.date <= range.end)
          byWeekday[day.weekday]++;
    return {
      label,
      ...range,
      available,
      total: available ? byWeekday.reduce((a, b) => a + b, 0) : null,
      byWeekday: available ? byWeekday : null,
    };
  };
  const months = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${state.year}-${String(i + 1).padStart(2, '0')}`;
    const start = prefix + '-01',
      end = prefix + '-' + new Date(Date.UTC(state.year, i + 1, 0)).getUTCDate();
    return row(
      new Date(start + 'T00:00:00Z').toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
      }),
      { start, end },
    );
  });
  const count = Number(state.assessmentStagesByModality?.[modality]);
  const candidates = (events || []).filter((e) => appliesTo(e, modality));
  const stages = Array.from({ length: [2, 3, 4].includes(count) ? count : 0 }, (_, i) => {
    const id = String(i + 1),
      matches = candidates.filter((e) =>
        new RegExp(`^stage-${id}:${modality}$`).test(e.requirementId || ''),
      );
    if (matches.length === 1) return { start: matches[0].start, end: matches[0].end };
    return null;
  });
  const periods = [...(state.periods || [])].sort((a, b) => a.start.localeCompare(b.start));
  let semesters: (DateRange | null)[] = [null, null];
  if (periods.length === 2) semesters = periods.map((p) => ({ start: p.start, end: p.end }));
  else if (periods.length === 1 && /\b[12]\s*[ºªo°]?\s*semestre\b/i.test(periods[0].name || ''))
    semesters[Number(periods[0].name!.match(/[12]/)![0]) - 1] = {
      start: periods[0].start,
      end: periods[0].end,
    };
  else if (count === 2) semesters = stages;
  else if (count === 4)
    semesters = [0, 2].map((i) =>
      stages[i] && stages[i + 1] ? { start: stages[i].start, end: stages[i + 1]!.end } : null,
    );
  const notes = [];
  const overlaps = (ranges: (DateRange | null)[]) =>
    ranges.some(
      (a, i) => a && ranges.some((b, j) => b && i < j && a.start <= b.end && b.start <= a.end),
    );
  if (overlaps(semesters)) {
    semesters = [null, null];
    notes.push('Confira os intervalos dos semestres: há sobreposição.');
  }
  const stageRows = stages.map((range, i) =>
    row(`${i + 1}º ${count === 4 ? 'bimestre' : count === 3 ? 'trimestre' : 'semestre'}`, range),
  );
  if (overlaps(stages)) {
    for (const item of stageRows) {
      item.available = false;
      item.total = null;
      item.byWeekday = null;
    }
    notes.push('Confira os intervalos das etapas: há sobreposição.');
  }
  const semesterRows = semesters.map((range, i) => row(`${i + 1}º semestre`, range));
  if (semesters.some((r) => !r || r.start > r.end))
    notes.push(
      'Preencha os intervalos dos semestres letivos para completar a distribuição semestral.',
    );
  if (stages.some((r) => !r || r.start > r.end))
    notes.push('Preencha os intervalos das etapas de avaliação para completar sua distribuição.');
  if (ledger && semesterRows.every((r) => r.available)) {
    const uncovered = ledger.filter(
      (d) =>
        d.counted && !semesters.some((s) => s !== null && d.date >= s.start && d.date <= s.end),
    ).length;
    if (uncovered)
      notes.push(
        `${uncovered} dia(s) letivo(s) fora dos intervalos dos semestres. Confira as datas cadastradas.`,
      );
  }
  return {
    months,
    stages: count === 4 || count === 3 ? stageRows : [],
    stageLabel: count === 4 ? 'bimestre' : 'trimestre',
    semesters: semesterRows,
    annual: row('Total anual', { start: `${state.year}-01-01`, end: `${state.year}-12-31` }),
    notes,
  };
}
