/** Private numeric/date proof: run against the committed old code and the new code separately. */
import { writeFileSync, chmodSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSnapshot } from './snapshot.ts';
// This historical probe intentionally loads an explicit old checkout. It is not
// the v4 M7 verifier and has no compile-time dependency on the live domain.
type HistoricEvent = {
  id: string;
  start: string;
  end: string;
  requirementId?: string;
  deadlineAdjustment?: { date: string; reviewed: boolean };
};
type ActivityState = {
  year: number;
  schemaVersion?: number;
  campus?: string;
  modalities?: string[];
  offer?: string;
  events: HistoricEvent[];
};
type HistoricRequirement = {
  id: string;
  modality?: string;
  deadline?: string;
  deadlinePolicy?: string;
};
type HistoricCoverage = {
  requirement: { id: string };
  modality: string;
  applicability: string;
  coverage: string;
  execution: string;
  events: HistoricEvent[];
};
type EvaluationModule = {
  evaluateCalendar(state: ActivityState, events: HistoricEvent[]): unknown;
};
type StageModule = { assessmentDayCounts(state: ActivityState, events: HistoricEvent[]): unknown };
type DurationModule = {
  recalculatePeriods(state: ActivityState, events: HistoricEvent[]): unknown;
};
type RulesModule = {
  activityCoverage(state: ActivityState, events: HistoricEvent[]): HistoricCoverage[];
};
type DeadlinesModule = {
  prorogatedDeadline(
    state: ActivityState,
    date: string,
    events: HistoricEvent[],
    modality: string,
  ): { date: string | null; original: string; source: string };
};
type ConversionModule = { convertCalendarV2(state: ActivityState): ActivityState };
type ObligationsModule = { activityChecklist(state: ActivityState): HistoricRequirement[] };
type ModalitiesModule = { calendarModalities(state: ActivityState): string[] };
type ObservancesModule = {
  applyObservances(this: void, events: HistoricEvent[], state: ActivityState): HistoricEvent[];
};
type TeacherDayModule = {
  campusInstitutionalEvents(
    this: void,
    events: HistoricEvent[],
    state: ActivityState,
  ): HistoricEvent[];
};

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--') || !isAbsolute(value))
    throw Error(`Informe --${name} com caminho absoluto.`);
  return value;
}
function result<T>(work: () => T) {
  try {
    return { available: true, value: work() };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : 'Estado não calculável',
    };
  }
}
async function main() {
  const input = option('snapshot'),
    output = option('out'),
    codeRoot = option('code-root');
  const { statSync } = await import('node:fs');
  if ((statSync(dirname(output)).mode & 0o077) !== 0)
    throw Error('A pasta de projeção deve ser privada (700).');
  const snapshot = readSnapshot(input);
  const moduleUrl = (current: string, legacy: string) =>
    pathToFileURL(join(codeRoot, existsSync(join(codeRoot, current)) ? current : legacy)).href;
  const deadlineRules = (await import(
    moduleUrl('src/domain/calendar/activities/deadlines.ts', 'src/calendar-rules/index.ts')
  )) as DeadlinesModule;
  const evaluation = (await import(
    moduleUrl('src/domain/calendar/counting/evaluation.ts', 'src/evaluation.ts')
  )) as EvaluationModule;
  const stages = (await import(
    moduleUrl('src/domain/calendar/counting/assessment-days.ts', 'src/assessment-day-counts.ts')
  )) as StageModule;
  const duration = (await import(
    moduleUrl('src/domain/calendar/counting/duration.ts', 'src/duration.ts')
  )) as DurationModule;
  const rules = (await import(
    moduleUrl('src/domain/calendar/activities/coverage.ts', 'src/calendar-rules/index.ts')
  )) as RulesModule;
  const conversion = (await import(
    moduleUrl('src/domain/calendar/normalization/conversion.ts', 'src/calendar-rules/conversion.ts')
  )) as ConversionModule;
  const obligations = (await import(
    moduleUrl('src/domain/calendar/activities/checklist.ts', 'src/obligations.ts')
  )) as ObligationsModule;
  const modalities = (await import(
    moduleUrl('src/domain/calendar/modalities.ts', 'src/modalities.ts')
  )) as ModalitiesModule;
  const observancePath = join(codeRoot, 'src/domain/calendar/observances.ts');
  const projectObservances = existsSync(observancePath)
    ? ((await import(pathToFileURL(observancePath).href)) as ObservancesModule).applyObservances
    : (
        (await import(
          moduleUrl('src/domain/institution/teacher-day.ts', 'src/teacher-day.ts')
        )) as TeacherDayModule
      ).campusInstitutionalEvents;
  const calendars = new Map((snapshot.tables.calendars ?? []).map((row) => [row._id, row]));
  const campuses = new Map((snapshot.tables.campuses ?? []).map((row) => [row._id, row]));
  const states: Record<string, unknown> = {};
  for (const table of ['calendarContents', 'calendarSnapshots'])
    for (const row of snapshot.tables[table] ?? []) {
      const local = row.state as ActivityState;
      let state = local;
      if (table === 'calendarContents') {
        const calendar = calendars.get(String(row.calendarId));
        const campus = calendar && campuses.get(String(calendar.campusId));
        if (!calendar || !campus || !Array.isArray(calendar.modalities))
          throw Error('Conteúdo sem calendário ou campus correspondente.');
        state = {
          ...local,
          schemaVersion: local.schemaVersion ?? 2,
          year: Number(calendar.year),
          campus: String(campus.name),
          modalities: calendar.modalities as string[],
          offer: String(calendar.modalities[0]),
        };
      }
      const projected = result(() => {
        state = conversion.convertCalendarV2(state);
        const institutional = (
          table === 'calendarContents' ? row.institutionalSnapshot : row.institutionalEvents
        ) as ActivityState['events'];
        const events = [...projectObservances(institutional, state), ...state.events];
        const coverage = result(() =>
          rules.activityCoverage(state, events).map((item) => ({
            id: item.requirement.id,
            modality: item.modality,
            applicability: item.applicability,
            coverage: item.coverage,
            execution: item.execution,
            records: item.events.map((event) => event.id),
          })),
        );
        const deadlines = obligations.activityChecklist(state).flatMap((requirement) =>
          requirement.deadline
            ? modalities
                .calendarModalities(state)
                .filter((modality) => !requirement.modality || requirement.modality === modality)
                .map((modality) => ({
                  id: requirement.id,
                  modality,
                  result: result(() => {
                    const deadline =
                      requirement.deadlinePolicy === 'reference'
                        ? deadlineRules.prorogatedDeadline(
                            state,
                            requirement.deadline!,
                            events,
                            modality,
                          )
                        : {
                            date: requirement.deadline!,
                            original: requirement.deadline!,
                            source: 'norm',
                          };
                    return {
                      date: deadline.date,
                      original: deadline.original,
                      source: deadline.source,
                    };
                  }),
                }))
            : [],
        );
        return {
          counts: result(() => evaluation.evaluateCalendar(state, events)),
          stages: result(() => stages.assessmentDayCounts(state, events)),
          periods: result(() => duration.recalculatePeriods(state, events)),
          deadlines,
          coverage,
          adjustments: state.events
            .filter((event) => event.deadlineAdjustment)
            .map((event) => ({
              id: event.id,
              requirementId: event.requirementId,
              start: event.start,
              end: event.end,
              date: event.deadlineAdjustment!.date,
              reviewed: event.deadlineAdjustment!.reviewed,
            })),
        };
      });
      states[`${table}:${row._id}`] = projected;
    }
  writeFileSync(output, JSON.stringify({ sourceSha256: snapshot.sha256, states }), { mode: 0o600 });
  chmodSync(output, 0o600);
  console.log(
    `Projeção privada concluída: ${Object.keys(states).length} estados; somente contagens, classificações e datas.`,
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error(
      'Não foi possível produzir a projeção privada. Confira parâmetros e estrutura do snapshot.',
    );
    process.exitCode = 1;
  });
}
