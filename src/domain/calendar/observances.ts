import type { ObservanceRule } from '../policies/contract.ts';
import { policyFor } from '../policies/registry.ts';
import { DomainError } from '../errors.ts';
import { parseDate } from './counting/core.ts';

export interface ObservanceState {
  year: number;
  observanceDates?: Record<string, string>;
}
interface ObservanceEvent {
  id: string;
  start: string;
  end: string;
  originalStart?: string;
  originalEnd?: string;
}
export const observanceEventId = (rule: ObservanceRule) => `inst:${rule.eventCode}`;
export const observanceRules = (year: number) => policyFor(year).observances;
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
  const issues: { key: string; message: string }[] = [];
  for (const entry of calendarObservances(events, state)) {
    const { rule, event, key, label } = entry;
    const selected = state.observanceDates?.[key];
    if (!rule || !event) {
      if (selected !== undefined)
        issues.push({
          key,
          message: `${label}: a escolha não está disponível na base deste calendário. Restaure a data institucional para limpar a escolha.`,
        });
      continue;
    }
    const originalStart = event.originalStart ?? event.start;
    const originalEnd = event.originalEnd ?? event.end;
    if (originalStart !== originalEnd || !rule.allowedDates.includes(originalStart))
      issues.push({
        key,
        message: `${label}: a referência institucional não corresponde às datas permitidas. Confira a base institucional.`,
      });
    if (selected !== undefined && !rule.allowedDates.includes(selected))
      issues.push({
        key,
        message: `${label}: escolha uma das datas permitidas: ${rule.allowedDates.map((date) => date.split('-').reverse().join('/')).join(', ')}.`,
      });
  }
  return issues;
}

/** Read projection: preserve the supplied confirmed event on conflict; never discard choices. */
export function applyObservances<T extends ObservanceEvent>(
  events: T[],
  state: ObservanceState,
): T[] {
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

export function validateObservances(events: ObservanceEvent[], state: ObservanceState) {
  const issues = observanceIssues(events, state);
  if (issues.length) throw new DomainError(issues.map((issue) => issue.message).join(' '));
}

export function chooseObservance<S extends ObservanceState>(
  state: S,
  key: string,
  date: string | undefined,
  events: ObservanceEvent[],
): S & ObservanceState {
  const choices = { ...state.observanceDates };
  if (date === undefined) delete choices[key];
  else {
    const rule = observanceRules(state.year).find((item) => item.key === key);
    if (!rule || !events.some((event) => event.id === observanceEventId(rule)))
      throw new DomainError('Observância não disponível na base deste calendário.');
    if (!rule.allowedDates.includes(date))
      throw new DomainError(`${rule.label}: escolha uma das datas permitidas.`);
    choices[key] = date;
  }
  return { ...state, observanceDates: Object.keys(choices).length ? choices : undefined };
}

/** Structural normalization does not apply a later policy to historical evidence. */
export function normalizeObservanceDates(choices: Record<string, string> | undefined) {
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
          parseDate(date);
        } catch {
          throw new DomainError('Data de observância inválida.');
        }
        return [key, date];
      }),
  );
}

/** Protect both the old and proposed identity/year when an administrator edits the catalogue. */
export function validateObservanceCatalogueEvent(
  event: { code: string; year: number; start: string; end: string },
  previous?: { code: string; year: number } | null,
) {
  const rules = [
    ...observanceRules(event.year),
    ...(previous ? observanceRules(previous.year) : []),
  ].filter((rule) => rule.eventCode === (previous?.code ?? event.code));
  for (const rule of rules)
    if (event.start !== event.end || !rule.allowedDates.includes(event.start))
      throw new DomainError(
        `${rule.label}: a referência institucional deve usar uma das datas permitidas na policy.`,
      );
}
