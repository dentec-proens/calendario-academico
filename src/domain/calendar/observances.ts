import { compactDate, compactRange } from '../date-labels.ts';
import { civilDate, type CivilDate } from '../civil-date.ts';
import type { ObservanceRule } from '../policies/contract.ts';
import { policyFor } from '../policies/registry.ts';
import { DomainError } from '../errors.ts';

export interface ObservanceState {
  year: number;
  observanceDates?: Record<string, CivilDate>;
}
interface ObservanceEvent {
  id: string;
  start: CivilDate;
  end: CivilDate;
  originalStart?: CivilDate;
  originalEnd?: CivilDate;
}
export const observanceEventId = (rule: ObservanceRule) => `inst:${rule.eventCode}`;
export const observanceRules = (year: number) => policyFor(year).observances;
export const isAllowedObservanceDate = (rule: ObservanceRule, date: CivilDate) =>
  rule.allowed.kind === 'list'
    ? rule.allowed.dates.includes(date)
    : rule.allowed.start <= date && date <= rule.allowed.end;
export const allowedObservanceDates = (rule: ObservanceRule, calendarYear?: number) =>
  rule.allowed.kind === 'list'
    ? rule.allowed.dates.map((date) => compactDate(date, calendarYear)).join(', ')
    : compactRange(rule.allowed, calendarYear);
/** “uma destas datas: 28 out 2027, 29 out 2027” or “uma data de 1 jul a 31 dez 2027”. */
const allowedChoice = (rule: ObservanceRule) =>
  rule.allowed.kind === 'list'
    ? `uma destas datas: ${allowedObservanceDates(rule)}`
    : `uma data de ${allowedObservanceDates(rule)}`;
export const observanceForEvent = (year: number, id: string) =>
  observanceRules(year).find((rule) => observanceEventId(rule) === id);

/** Includes orphaned choices, so their resolution never depends on a published event. */
export function calendarObservances(events: ObservanceEvent[], state: ObservanceState) {
  const rules = observanceRules(state.year);
  const keys = new Set([
    ...rules
      .filter((rule) => events.some((event) => event.id === observanceEventId(rule)))
      .map((rule) => rule.key),
    ...Object.keys(state.observanceDates ?? {}),
  ]);
  return [...keys].map((key) => {
    const rule = rules.find((item) => item.key === key);
    const event = rule && events.find((item) => item.id === observanceEventId(rule));
    return {
      key,
      rule,
      event,
      label: rule?.label ?? key,
      date: state.observanceDates?.[key] ?? event?.start,
    };
  });
}

export function observanceIssues(events: ObservanceEvent[], state: ObservanceState) {
  const issues: {
    key: string;
    /** Orphan choice, reference outside the allowed dates, or a choice outside them. */
    kind: 'orphan' | 'base' | 'choice';
    message: string;
  }[] = [];
  for (const entry of calendarObservances(events, state)) {
    const { rule, event, key, label } = entry;
    const selected = state.observanceDates?.[key];
    if (!rule || !event) {
      if (selected !== undefined)
        issues.push({
          key,
          kind: 'orphan',
          message: `${label}: a escolha não está disponível na base deste calendário. Restaure a data institucional para limpar a escolha.`,
        });
      continue;
    }
    const originalStart = event.originalStart ?? event.start;
    const originalEnd = event.originalEnd ?? event.end;
    if (originalStart !== originalEnd || !isAllowedObservanceDate(rule, originalStart))
      issues.push({
        key,
        kind: 'base',
        message: `${label}: a referência institucional não corresponde às datas permitidas. Confira a base institucional.`,
      });
    if (selected !== undefined && !isAllowedObservanceDate(rule, selected))
      issues.push({
        key,
        kind: 'choice',
        message: `${label}: escolha ${allowedChoice(rule)}.`,
      });
  }
  return issues;
}

/** Read projection: preserve the supplied confirmed event on conflict; never discard choices. */
export function applyObservances<T extends ObservanceEvent>(
  events: T[],
  state: ObservanceState,
): (T & Pick<ObservanceEvent, 'originalStart' | 'originalEnd'>)[] {
  const invalid = new Set(observanceIssues(events, state).map((issue) => issue.key));
  return events.map((event) => {
    const rule = observanceForEvent(state.year, event.id);
    if (!rule || invalid.has(rule.key)) return event;
    const originalStart = event.originalStart ?? event.start;
    const originalEnd = event.originalEnd ?? event.end;
    const date = state.observanceDates?.[rule.key];
    return {
      ...event,
      originalStart,
      originalEnd,
      start: date ?? originalStart,
      end: date ?? originalEnd,
    };
  });
}

/**
 * Refuses only a choice made now. One that a later rule or base change made invalid stays a
 * readiness issue: it must never stop the campus from saving something else.
 */
export function validateObservances(
  events: ObservanceEvent[],
  state: ObservanceState,
  previous: Pick<ObservanceState, 'observanceDates'>,
) {
  const issues = observanceIssues(events, state).filter(({ key }) => {
    const selected = state.observanceDates?.[key];
    return selected !== undefined && selected !== previous.observanceDates?.[key];
  });
  if (issues.length) throw new DomainError(issues.map((issue) => issue.message).join(' '));
}

export function chooseObservance<S extends ObservanceState>(
  state: S,
  key: string,
  date: CivilDate | undefined,
  events: ObservanceEvent[],
): S & ObservanceState {
  const choices = { ...state.observanceDates };
  if (date === undefined) delete choices[key];
  else {
    const rule = observanceRules(state.year).find((item) => item.key === key);
    if (!rule || !events.some((event) => event.id === observanceEventId(rule)))
      throw new DomainError('Observância não disponível na base deste calendário.');
    if (!isAllowedObservanceDate(rule, date))
      throw new DomainError(`${rule.label}: escolha ${allowedChoice(rule)}.`);
    choices[key] = date;
  }
  return { ...state, observanceDates: Object.keys(choices).length ? choices : undefined };
}

/** Structural normalization does not apply a later policy to historical evidence. */
export function normalizeObservanceDates(
  choices: Record<string, string> | undefined,
): Record<string, CivilDate> | undefined {
  if (!choices || !Object.keys(choices).length) return undefined;
  if (Object.keys(choices).length > 32)
    throw new DomainError('Quantidade de observâncias inválida.');
  return Object.fromEntries(
    Object.entries(choices)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, date]) => {
        if (!/^[a-z][a-z0-9-]{0,79}$/.test(key))
          throw new DomainError('Identidade de observância inválida.');
        try {
          return [key, civilDate(date)];
        } catch {
          throw new DomainError('Data de observância inválida.');
        }
      }),
  );
}

/** Protect both the old and proposed identity/year when an administrator edits the catalogue. */
export function validateObservanceCatalogueEvent(
  event: { code: string; year: number; start: CivilDate; end: CivilDate },
  previous?: { code: string; year: number } | null,
) {
  const rules = [
    ...observanceRules(event.year),
    ...(previous ? observanceRules(previous.year) : []),
  ].filter((rule) => rule.eventCode === (previous?.code ?? event.code));
  for (const rule of rules)
    if (event.start !== event.end || !isAllowedObservanceDate(rule, event.start))
      throw new DomainError(
        `${rule.label}: a referência institucional deve usar ${allowedChoice(rule)}, conforme a regra do ano.`,
      );
}

interface CoincidenceEvent {
  id: string;
  name: string;
  start: CivilDate;
  end: CivilDate;
  effect: string;
  category?: string;
}

/**
 * Why a chosen observance date would remove no school day: another exclusion or vacation on it,
 * a day outside the class week, or no school period. Advisory only: the norm lets the campus
 * choose the date, so this never becomes a check that stops the calendar.
 */
export function observanceCoincidences(
  events: readonly CoincidenceEvent[],
  state: { weekdays: readonly number[]; periods: readonly { start: CivilDate; end: CivilDate }[] },
  ownId: string,
  date: CivilDate,
): string[] {
  const reasons = events
    .filter(
      (event) =>
        event.id !== ownId &&
        event.start <= date &&
        date <= event.end &&
        (event.effect === 'exclude' || event.category === 'ferias'),
    )
    .map((event) => event.name);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (!state.weekdays.includes(weekday)) reasons.push('dia fora da semana letiva');
  if (state.periods.length && !state.periods.some((p) => p.start <= date && date <= p.end))
    reasons.push('fora dos períodos letivos');
  return [...new Set(reasons)];
}
