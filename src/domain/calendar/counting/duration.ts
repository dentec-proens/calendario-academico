import { calendarLimits } from '../config.ts';
import type { CountingEvent, CalendarPeriod, TeachingState } from '../model.ts';
import { parseDate, datesBetween } from './core.ts';
import { calendarModalities, appliesTo } from '../modalities.ts';
import { samePeriodScope } from '../organization/periods.ts';

type DurationEvent = Omit<CountingEvent, 'id'> & { id?: string };
type DurationState = Pick<
  TeachingState,
  'year' | 'weekConfirmed' | 'weekdays' | 'offer' | 'modalities' | 'schemaVersion'
>;
export function recalculatePeriods<T extends CalendarPeriod>(
  state: DurationState & { periods: T[] },
  events: DurationEvent[],
): T[] {
  const periods = state.periods.map((p) =>
    p.targetDays === undefined ||
    p.association?.status === 'a-classificar' ||
    (state.schemaVersion === 3 && p.association?.status !== 'defined')
      ? { ...p }
      : {
          ...p,
          end: durationEnd(
            p.start,
            p.targetDays,
            p.association?.status === 'defined'
              ? {
                  ...state,
                  modalities: p.association.modalities,
                  offer: p.association.modalities[0],
                }
              : state,
            events,
          ),
        },
  );
  const ordered = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++)
      if (samePeriodScope(ordered[i], ordered[j]) && ordered[i].end >= ordered[j].start)
        throw Error(
          `O término previsto de ${ordered[i].name} (${ordered[i].end}) alcança ${ordered[j].name}. Ajuste o início do período seguinte ou os dias letivos; as datas anteriores foram mantidas.`,
        );
  return periods;
}

export function durationEnd(
  start: string,
  quantity: number | string,
  state?: DurationState,
  events: DurationEvent[] = [],
) {
  const count = Number(quantity),
    time = parseDate(start);
  if (
    !Number.isInteger(count) ||
    count < calendarLimits.minimumTargetDays ||
    count > calendarLimits.maximumTargetDays
  )
    throw Error(
      `Informe uma quantidade inteira entre ${calendarLimits.minimumTargetDays} e ${calendarLimits.maximumTargetDays} dias.`,
    );
  if (!state) return new Date(time + (count - 1) * 86400000).toISOString().slice(0, 10);
  if (!state.weekConfirmed || !state.weekdays?.length)
    throw Error('Confirme a semana letiva antes de calcular o término.');
  if (Number(start.slice(0, 4)) !== state.year)
    throw Error('O início deve pertencer ao ano do calendário.');
  const ends = calendarModalities(state).map((modality) => {
    const scoped = events.filter((e) => appliesTo(e, modality));
    let total = 0;
    for (const date of datesBetween(start, `${state.year}-12-31`)) {
      const active = scoped.filter((e) => e.start <= date && e.end >= date);
      if (active.some((e) => e.kind === 'exclude')) continue;
      if (
        active.some((e) => e.kind === 'include') ||
        state.weekdays.includes(new Date(parseDate(date)).getUTCDay())
      ) {
        if (++total === count) return date;
      }
    }
    throw Error('Não há dias letivos suficientes até o fim do ano para essa quantidade.');
  });
  if (new Set(ends).size > 1)
    throw Error(
      'As ofertas têm impedimentos diferentes e resultam em términos diferentes. Revise os períodos por oferta.',
    );
  return ends[0];
}
