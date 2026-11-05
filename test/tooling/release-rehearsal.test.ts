import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, test, vi } from 'vitest';
import { assertRehearsal, rehearseBackup } from '../../scripts/release-rehearsal.ts';

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

test('two documents in force of one type refuse as the backend does', () => {
  const document = row({ year: 2027, type: 'norma', status: 'vigente' });
  const content = row({ calendarId: 'c', state: {} });
  expect(
    report({
      calendars: [draft],
      campuses: [campus],
      calendarContents: [content],
      documents: [document, document],
    }).failures,
  ).toEqual([{ calendarId: 'c', error: 'Base de 2027 com registros duplicados.' }]);
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
