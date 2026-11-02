import { civilDate } from '../domain/civil-date.ts';
import {
  assessmentStageCounts,
  termLabels,
  termsByOrganization,
} from '../domain/calendar/config.ts';
import type { DateRange } from '../domain/calendar/model.ts';
import type { PrintState, PrintResult, PrintEvent, DistributionRow } from './types.ts';
import { appliesTo } from '../domain/calendar/modalities.ts';
import { periodsForOffer } from '../domain/calendar/organization/periods.ts';
import { linksToReview } from '../domain/calendar/activities/links.ts';
import { sameActivity } from '../domain/calendar/activities/activity-ref.ts';
import { stageActivity } from '../domain/calendar/activities/assessment.ts';
import {
  offerFor,
  stageCount,
  stageCycle,
  stageInTerm,
  stageTerm,
} from '../domain/calendar/offers.ts';

export function teachingDayBreakdown(
  state: PrintState,
  events: PrintEvent[],
  result: PrintResult,
  modality: string,
) {
  const byOffer = result?.byOffer;
  const scoped = byOffer ? byOffer[modality] : result;
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
    const start = civilDate(prefix + '-01'),
      end = civilDate(
        prefix +
          '-' +
          String(new Date(Date.UTC(state.year, i + 1, 0)).getUTCDate()).padStart(2, '0'),
      );
    return row(
      new Date(start + 'T00:00:00Z').toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
      }),
      { start, end },
    );
  });
  const offer = offerFor(state, modality);
  const count = offer ? stageCount(offer) : 0;
  const local = (events || []).flatMap((e) =>
    e.id !== undefined && e.scope && !e.institutional ? [{ ...e, id: e.id, scope: e.scope }] : [],
  );
  // Stage dates under “Vínculo a conferir” are not distributed. A stage out of its cycle keeps
  // its row, with its dates and a note, but no total (below).
  const review = linksToReview({ ...state, events: local });
  const candidates = (events || []).filter((e) => {
    const issue = e.id === undefined ? undefined : review.get(e.id);
    return appliesTo(e, offer ?? modality) && (!issue || issue === 'out-of-cycle');
  });
  const stages = Array.from(
    { length: assessmentStageCounts.includes(count) ? count : 0 },
    (_, i) => {
      const link = stageActivity(state, 'stage', modality, i + 1);
      const matches = candidates.filter((e) => e.activity && sameActivity(e.activity, link));
      if (matches.length === 1) return { start: matches[0].start, end: matches[0].end };
      return null;
    },
  );
  const periods = [...periodsForOffer(state, modality)].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  let semesters: (DateRange | null)[] = [null, null];
  for (const period of periods) {
    if (period.association.status !== 'defined' || period.association.term === 'annual') continue;
    semesters[period.association.term === 'first' ? 0 : 1] = {
      start: period.start,
      end: period.end,
    };
  }
  const notes = [];
  const overlaps = (ranges: (DateRange | null)[]) =>
    ranges.some(
      (a, i) => a && ranges.some((b, j) => b && i < j && a.start <= b.end && b.start <= a.end),
    );
  if (overlaps(semesters)) {
    semesters = [null, null];
    notes.push('Confira os intervalos dos semestres: há sobreposição.');
  }
  const stageRows = stages.map((range, i) => {
    const term = offer ? stageTerm(offer, i + 1) : undefined;
    const label =
      offer?.organization === 'semestral' && offer.stages?.status === 'defined'
        ? `${stageInTerm(i + 1, offer.stages.perTerm).number}ª etapa — ${term ? termLabels[term] : 'ciclo a conferir'}`
        : `${i + 1}ª etapa — ${offer ? (stageCycle(offer) ?? 'ciclo a conferir') : 'ciclo a conferir'}`;
    const item = row(label, range);
    if (
      term &&
      range &&
      !periods.some(
        (period) =>
          period.association?.status === 'defined' &&
          period.association.term === term &&
          period.start <= range.start &&
          range.end <= period.end,
      )
    ) {
      item.available = false;
      item.total = null;
      item.byWeekday = null;
      notes.push(
        `Confira ${label}: o intervalo deve ficar inteiramente dentro do período do seu ciclo.`,
      );
    }
    return item;
  });
  if (overlaps(stages)) {
    for (const item of stageRows) {
      item.available = false;
      item.total = null;
      item.byWeekday = null;
    }
    notes.push('Confira os intervalos das etapas: há sobreposição.');
  }
  const semesterRows = semesters.map((range, i) => row(`${i + 1}º semestre`, range));
  const showSemesters = offer?.organization === 'semestral';
  if (showSemesters && semesters.some((r) => !r || r.start > r.end))
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
    stages: stageRows,
    stageLabel: 'etapa de avaliação',
    stageGroups:
      offer && offer.organization !== 'a-classificar'
        ? termsByOrganization[offer.organization]
            .map((term) => ({
              term,
              label: `Etapas de avaliação — ${termLabels[term]}`,
              rows: stageRows.filter((_, index) => stageTerm(offer, index + 1) === term),
            }))
            .filter((group) => group.rows.length)
        : [],
    showSemesters,
    semesters: semesterRows,
    annual: row('Total anual', {
      start: civilDate(`${state.year}-01-01`),
      end: civilDate(`${state.year}-12-31`),
    }),
    notes,
  };
}
