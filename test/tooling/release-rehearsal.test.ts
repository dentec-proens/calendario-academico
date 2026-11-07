import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, test, vi } from 'vitest';
import { assertRehearsal, rehearseBackup } from '../../scripts/release-rehearsal.ts';
import { readyContent } from '../helpers/lifecycle.ts';

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

function backup(tables: Record<string, object[]>) {
  const directory = mkdtempSync(join(tmpdir(), 'rehearsal-test-'));
  directories.push(directory);
  writeFileSync(
    join(directory, 'before.zip'),
    zipSync(
      Object.fromEntries(
        Object.entries({ _tables: [], _storage: [], ...tables }).map(([name, rows]) => [
          `${name}/documents.jsonl`,
          strToU8(rows.map((row) => JSON.stringify(row)).join('\n')),
        ]),
      ),
    ),
  );
  return directory;
}
const row = (fields: object) => ({ _id: 'row', _creationTime: 1, ...fields });
const draft = row({ _id: 'c', status: 'rascunho', year: 2027, campusId: 'x' });
const campus = row({ _id: 'x', name: 'Campus' });
const report = (tables: Record<string, object[]>) =>
  rehearseBackup(join(backup(tables), 'before.zip'));

test('a calendar with no content is a failure, not one fewer to check', () => {
  expect(report({ calendars: [draft], campuses: [campus] }).failures).toEqual([
    { calendarId: 'c', error: 'Calendário sem conteúdo.' },
  ]);
});

test('a calendar of a missing campus is a failure', () => {
  const content = row({ calendarId: 'c', state: {} });
  expect(report({ calendars: [draft], calendarContents: [content] }).failures).toEqual([
    { calendarId: 'c', error: 'Calendário de campus inexistente.' },
  ]);
});

test('a calendar that would stop saving stops the release, and its reason stays with the backup', () => {
  const directory = backup({
    calendars: [draft],
    campuses: [campus],
    calendarContents: [row({ calendarId: 'c', state: { periods: 'DADO_DIGITADO' } })],
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  expect(() => assertRehearsal(directory, false)).toThrow('O ensaio recusaria 1');
  assertRehearsal(directory, true);
  expect(log.mock.calls.flat().join(' ')).not.toContain('DADO_DIGITADO');
  const saved = JSON.parse(readFileSync(join(directory, 'rehearsal.json'), 'utf8')) as {
    skipped: boolean;
    failures: unknown[];
  };
  expect(saved).toMatchObject({ skipped: true });
  expect(saved.failures).toHaveLength(1);
});

test('the terminal tells the rules stamp from a stored difference, whose values stay with the backup', () => {
  const directory = backup({
    calendars: [draft],
    campuses: [campus],
    calendarContents: [
      row({
        calendarId: 'c',
        catalogueRevision: 1,
        institutionalSnapshot: [],
        documentSnapshot: [],
        state: {
          ...readyContent(),
          rulesetVersion: 'consup-292-2027-v1',
          observanceDates: {},
        },
      }),
    ],
  });
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  assertRehearsal(directory, false);
  const printed = log.mock.calls.flat().join('\n');
  expect(printed).toContain('rulesetVersion: atualizado em 1, esperado.');
  expect(printed).toContain('Conteúdo gravado difere');
  expect(printed).toContain('observanceDates: muda em 1.');
  expect(printed).not.toContain('consup-292-2027-v1');
  const saved = JSON.parse(readFileSync(join(directory, 'rehearsal.json'), 'utf8')) as {
    examples: Record<string, unknown>;
  };
  expect(saved.examples.observanceDates).toEqual({
    calendarId: 'c',
    before: '{}',
    after: 'ausente',
  });
});

test('a backup in format 6 is rehearsed as the migration will convert it', () => {
  const { schemaVersion: _version, events, ...ready } = readyContent();
  const content = (state: object) =>
    row({
      calendarId: 'c',
      catalogueRevision: 1,
      institutionalSnapshot: [],
      documentSnapshot: [],
      state: {
        ...ready,
        schemaVersion: 6,
        events: events.filter((event) => event.activity?.activityId !== 'teacher-vacation'),
        ...state,
      },
    });
  const tables = { calendars: [draft], campuses: [campus] };
  const vacation = {
    id: 'teacher-vacation-january',
    name: 'Férias docentes — 15 dias',
    start: '2027-01-04',
    end: '2027-01-18',
    effect: 'exclude',
    category: 'ferias',
    offers: ready.offers.map((offer) => offer.id),
  };
  const converted = report({
    ...tables,
    calendarContents: [
      content({
        teacherVacations: { firstStart: '2027-01-04', firstEnd: '2027-01-18' },
        events: [...events.filter((event) => !event.activity), vacation],
      }),
    ],
  });
  expect(converted.failures).toEqual([]);
  expect(converted.saved).toBe(1);
  // The conversion refuses what diverges, and the release hears about it as any other refusal.
  expect(
    report({
      ...tables,
      calendarContents: [
        content({
          teacherVacations: { firstStart: '2027-01-05', firstEnd: '2027-01-18' },
          events: [vacation],
        }),
      ],
    }).failures,
  ).toEqual([
    {
      calendarId: 'c',
      error:
        'Conversão ao formato 7: as datas de teacher-vacation-january divergem de teacherVacations',
    },
  ]);
});
