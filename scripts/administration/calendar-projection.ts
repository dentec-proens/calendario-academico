import type * as EvaluationModule from '../../src/evaluation.ts';
import type * as StageModule from '../../src/assessment-day-counts.ts';
import type * as DurationModule from '../../src/duration.ts';
import type * as RulesModule from '../../src/calendar-rules/index.ts';
import type * as ConversionModule from '../../src/calendar-rules/conversion.ts';
import type * as ObligationsModule from '../../src/obligations.ts';
import type * as ModalitiesModule from '../../src/modalities.ts';
import type * as TeacherDayModule from '../../src/teacher-day.ts';
/** Private numeric/date proof: run against the committed old code and the new code separately. */
import { writeFileSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSnapshot } from './snapshot.ts';
import type { ActivityState } from '../../src/domain-types.ts';

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
  const evaluation = (await import(
    pathToFileURL(join(codeRoot, 'src/evaluation.ts')).href
  )) as typeof EvaluationModule;
  const stages = (await import(
    pathToFileURL(join(codeRoot, 'src/assessment-day-counts.ts')).href
  )) as typeof StageModule;
  const duration = (await import(
    pathToFileURL(join(codeRoot, 'src/duration.ts')).href
  )) as typeof DurationModule;
  const rules = (await import(
    pathToFileURL(join(codeRoot, 'src/calendar-rules/index.ts')).href
  )) as typeof RulesModule;
  const conversion = (await import(
    pathToFileURL(join(codeRoot, 'src/calendar-rules/conversion.ts')).href
  )) as typeof ConversionModule;
  const obligations = (await import(
    pathToFileURL(join(codeRoot, 'src/obligations.ts')).href
  )) as typeof ObligationsModule;
  const modalities = (await import(
    pathToFileURL(join(codeRoot, 'src/modalities.ts')).href
  )) as typeof ModalitiesModule;
  const teacherDay = (await import(
    pathToFileURL(join(codeRoot, 'src/teacher-day.ts')).href
  )) as typeof TeacherDayModule;
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
        const events = [
          ...teacherDay.campusInstitutionalEvents(institutional, state),
          ...state.events,
        ];
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
                        ? rules.prorogatedDeadline(state, requirement.deadline!, events, modality)
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
