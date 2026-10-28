import type {
  CalendarPeriod,
  AssessmentSettings,
  Organization,
  IntakeConfiguration,
} from '../domain-types.ts';
import { calendarModalities } from '../modalities.ts';
import { organizationSummary } from './index.ts';

function legacySemester(period: CalendarPeriod) {
  const label = (period.name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const first =
    /(?:\b1\s*[ºo°]?\s*semestre|primeiro\s+semestre|semestre\s*[-:]?\s*1\b|\b\d{4}\s*\/\s*1\b)/.test(
      label,
    );
  const second =
    /(?:\b2\s*[ºo°]?\s*semestre|segundo\s+semestre|semestre\s*[-:]?\s*2\b|\b\d{4}\s*\/\s*2\b)/.test(
      label,
    );
  return first === second ? undefined : first ? ('first' as const) : ('second' as const);
}

/** Explicit, deterministic adaptation. Never writes the source or claims a publication occurred. */
export function convertCalendarV2<T extends AssessmentSettings & { periods: CalendarPeriod[] }>(
  input: T,
) {
  if (input.schemaVersion === 3)
    return {
      ...input,
      schemaVersion: 3 as const,
      regime: organizationSummary(input.organizationByModality ?? {}, calendarModalities(input)),
    };
  const state = structuredClone(input),
    modalities = calendarModalities(state);
  const known = state.regime === 'anual' || state.regime === 'semestral';
  const count = state.regime === 'anual' ? 1 : 2;
  const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
  const unambiguous =
    known &&
    (!sorted.length ||
      (sorted.length === count &&
        sorted.every((p, i) => !i || sorted[i - 1].end < p.start) &&
        (state.regime === 'anual' ||
          (state.periods.every((p) => legacySemester(p)) &&
            new Set(state.periods.map(legacySemester)).size === 2))));
  const organizationByModality: Record<string, Organization> = Object.fromEntries(
    modalities.map((m) => [
      m,
      unambiguous ? (state.regime as 'anual' | 'semestral') : 'a-classificar',
    ]),
  );
  const periods = state.periods.map((p) => ({
    ...p,
    association: unambiguous
      ? {
          status: 'defined' as const,
          modalities: [...modalities],
          term: state.regime === 'anual' ? ('annual' as const) : legacySemester(p)!,
        }
      : { status: 'a-classificar' as const },
  }));
  const intakeByModality: Record<string, Record<string, IntakeConfiguration>> = {};
  if (modalities.length === 1 && state.secondSemesterIntake !== undefined)
    intakeByModality[modalities[0]] = {
      second: {
        status: state.secondSemesterIntake ? 'yes' : 'no',
      },
    };
  return {
    ...state,
    schemaVersion: 3 as const,
    organizationByModality,
    intakeByModality,
    periods,
    regime: organizationSummary(organizationByModality, modalities),
    conversion: {
      from: 2 as const,
      organization: unambiguous ? ('classified' as const) : ('pending' as const),
      legacySecondSemesterIntake: state.secondSemesterIntake,
    },
  };
}
