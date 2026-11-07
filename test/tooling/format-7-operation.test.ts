import { expect, test } from 'vitest';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { inventory } from '../../scripts/administration/format-7-inventory.ts';
import { compareFormat7 } from '../../scripts/administration/verify-format-7.ts';
import type { SnapshotRow } from '../../scripts/administration/snapshot.ts';
import { convertToFormat7 } from '../../src/domain/calendar/normalization/convert-format-7.ts';

const date = (id: string, fields: object = {}) => ({
  id,
  name: id,
  start: '2027-07-05',
  end: '2027-07-20',
  effect: 'note',
  offers: ['integrado'],
  ...fields,
});
const teacher = date('teacher-vacation-january', {
  name: 'Férias docentes — 45 dias',
  start: '2027-01-01',
  end: '2027-02-14',
  effect: 'exclude',
  category: 'ferias',
});
const state = (events: object[]) => ({
  schemaVersion: 6,
  offers: [{ id: 'integrado', kind: 'integrado' }],
  teacherVacations: { firstStart: '2027-01-01', firstEnd: '2027-02-14' },
  events: [teacher, ...events],
});
const row = (id: string, fields: object) =>
  ({ _id: id, _creationTime: 1, ...fields }) as unknown as SnapshotRow;
const content = (id: string, calendarId: string, events: object[]) =>
  row(id, {
    calendarId,
    state: state(events),
    catalogueRevision: 1,
    institutionalSnapshot: [],
    documentSnapshot: [],
  });
const calendars = [row('c', { status: 'rascunho', year: 2027 })];

test('the inventory lists what to decide, without inferring anything', () => {
  const report = inventory({
    calendars,
    calendarContents: [
      content('1', 'c', [
        date('avulsa', { name: 'Férias escolares', category: 'ferias', effect: 'exclude' }),
        date('recesso', { name: 'Recesso escolar de julho' }),
        date('feriado', { name: 'Feriado', category: 'feriado' }),
        date('vinculada', { name: 'Férias', activity: { activityId: 'diary', term: 'first' } }),
      ]),
    ],
  });
  expect(report.candidates.map(({ eventId, changesCount }) => [eventId, changesCount])).toEqual([
    ['avulsa', false],
    ['recesso', true],
  ]);
  expect(report.teacherTotals).toEqual([]);
  expect(report.refused).toEqual([]);
});

test('the inventory reports totals other than 45 and what the conversion refuses', () => {
  const short = { ...teacher, end: '2027-01-31', name: 'Férias docentes — 31 dias' };
  const report = inventory(
    {
      calendars,
      calendarContents: [
        row('1', {
          calendarId: 'c',
          state: {
            ...state([]),
            teacherVacations: { firstStart: '2027-01-01', firstEnd: '2027-01-31' },
            events: [short],
          },
        }),
      ],
      calendarSubmissions: [
        (() => {
          const submission = {
            calendarId: 'c',
            state: {
              ...state([]),
              teacherVacations: { firstStart: '2027-01-02', firstEnd: '2027-01-31' },
              events: [short],
            },
            catalogueRevision: 1,
            institutionalSnapshot: [],
            documentSnapshot: [],
          };
          return row('2', { ...submission, contentHash: contentHash(submission as never) });
        })(),
        row('3', { calendarId: 'c', state: state([]), contentHash: 'outro' }),
      ],
    },
    { c: ['missing-date'] },
  );
  expect(report.teacherTotals).toEqual([
    { calendarId: 'c', status: 'rascunho', days: 31, expected: 45 },
  ]);
  expect(report.unknownListed).toEqual([{ calendarId: 'c', eventId: 'missing-date' }]);
  expect(report.refused).toEqual([
    {
      table: 'calendarSubmissions',
      id: '2',
      reason: 'as datas de teacher-vacation-january divergem de teacherVacations',
    },
    { table: 'calendarSubmissions', id: '3', reason: 'o hash gravado não é o do próprio envio' },
  ]);
});

/** The export after the migration, as the converter specifies it. */
function migrated(before: SnapshotRow[], listed: readonly string[] = []) {
  return before.map((document) => {
    const next = convertToFormat7(document as never, listed).document as unknown as SnapshotRow;
    return 'contentHash' in document
      ? ({ ...next, contentHash: contentHash(next as never) } as SnapshotRow)
      : next;
  });
}
function exportsOf(events: object[] = [], listed: readonly string[] = []) {
  const before = [content('1', 'c', events)];
  const submission = before[0] as unknown as Record<string, unknown>;
  const submissions = [
    row('2', { ...submission, _id: '2', contentHash: contentHash(submission as never) }),
  ];
  return {
    before: { calendars, calendarContents: before, calendarSubmissions: submissions },
    after: {
      calendars,
      calendarContents: migrated(before, listed),
      calendarSubmissions: migrated(submissions, listed),
    },
  };
}

test('the verifier accepts exactly what the converter produces', () => {
  const { before, after } = exportsOf();
  expect(compareFormat7(before, after, {})).toEqual([]);
});

test('a date that changes its effect passes only when it is on the approved list', () => {
  const events = [date('avulsa', { name: 'Férias escolares', category: 'ferias' })];
  const { before, after } = exportsOf(events, ['avulsa']);
  expect(compareFormat7(before, after, { c: ['avulsa'] })).toEqual([]);
  expect(compareFormat7(before, after, {})).toEqual([
    'calendarContents 1: conteúdo diverge',
    'calendarSubmissions 2: conteúdo diverge',
  ]);
});

test('the verifier reports what the migration should not have touched', () => {
  const { before, after } = exportsOf();
  const changed = { ...after, calendars: [row('c', { status: 'vigente' })] };
  expect(compareFormat7(before, changed, {})).toEqual([
    'calendars: mudou, e a migração não a escreve',
  ]);
  const [submission] = after.calendarSubmissions;
  expect(
    compareFormat7(
      before,
      { ...after, calendarSubmissions: [{ ...submission!, contentHash: 'alheio' }] },
      {},
    ),
  ).toEqual([
    'calendarSubmissions 2: hash novo diverge',
    'calendarSubmissions 2: deixou de coincidir com o conteúdo',
  ]);
  expect(compareFormat7(before, { ...after, calendarContents: [] }, {})).toContain(
    'calendarContents: quantidade mudou',
  );
});
