import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  convertToFormat7,
  Format7ConversionError,
  type Format6Document,
} from '../../src/domain/calendar/normalization/convert-format-7.ts';
import { storedCases } from '../helpers/stored-fixtures.ts';

const format6 = () =>
  (
    JSON.parse(
      readFileSync(new URL('../fixtures/stored/contents-format-6.json', import.meta.url), 'utf8'),
    ) as {
      cases: {
        name: string;
        content: Format6Document;
        submissions: Format6Document[];
      }[];
    }
  ).cases;

const offers = [{ id: 'integrado' }, { id: 'graduacao' }];
const vacation = (id: string, start: string, end: string, days: number) => ({
  id,
  name: `Férias docentes — ${days} dias`,
  start,
  end,
  effect: 'exclude' as const,
  category: 'ferias',
  offers: ['integrado', 'graduacao'],
});
const document = (changes: Partial<Format6Document['state']> = {}): Format6Document => ({
  state: {
    schemaVersion: 6,
    offers,
    events: [
      vacation('teacher-vacation-january', '2027-01-04', '2027-01-18', 15),
      vacation('teacher-vacation-july', '2027-07-05', '2027-07-20', 16),
      {
        id: 'free',
        name: 'Férias escolares',
        start: '2027-07-05',
        end: '2027-07-20',
        effect: 'note',
        category: 'ferias',
        offers: ['integrado'],
      },
    ],
    teacherVacations: {
      firstStart: '2027-01-04',
      firstEnd: '2027-01-18',
      secondStart: '2027-07-05',
      secondEnd: '2027-07-20',
    },
    ...changes,
  },
});
const eventsOf = (doc: Format6Document) => doc.state.events;

describe('convertToFormat7', () => {
  test('the field leaves, its dates get the link, and nothing the count reads changes', () => {
    const before = document();
    const { document: after, converted } = convertToFormat7(before);
    expect(after.state).not.toHaveProperty('teacherVacations');
    expect(after.state.schemaVersion).toBe(7);
    expect(converted).toEqual([]);
    expect(after.state.events.map((event) => event.activity)).toEqual([
      { activityId: 'teacher-vacation' },
      { activityId: 'teacher-vacation' },
      undefined,
    ]);
    for (const [index, event] of after.state.events.entries()) {
      const { activity: _activity, ...rest } = event;
      expect(rest).toEqual(eventsOf(before)[index]);
    }
  });

  test('the field can be rebuilt from the result', () => {
    const before = document();
    const dates = convertToFormat7(before).document.state.events.filter(
      (event) => event.activity?.activityId === 'teacher-vacation',
    );
    expect({
      firstStart: dates[0]!.start,
      firstEnd: dates[0]!.end,
      secondStart: dates[1]!.start,
      secondEnd: dates[1]!.end,
    }).toEqual(before.state.teacherVacations);
  });

  test('blank optional fields of old forms mean absence', () => {
    const before = document({
      teacherVacations: {
        firstStart: '2027-01-04',
        firstEnd: '2027-01-18',
        secondStart: '2027-07-05',
        secondEnd: '2027-07-20',
        thirdStart: '',
        thirdEnd: '',
      },
    });
    expect(convertToFormat7(before).document.state).not.toHaveProperty('teacherVacations');
  });

  test('a listed date becomes a school vacation, which is what may change the count', () => {
    const { document: after, converted } = convertToFormat7(document(), ['free', 'elsewhere']);
    expect(converted).toEqual(['free']);
    expect(after.state.events.find((event) => event.id === 'free')).toEqual({
      id: 'free',
      name: 'Férias escolares',
      start: '2027-07-05',
      end: '2027-07-20',
      effect: 'exclude',
      category: 'ferias',
      offers: ['integrado'],
      activity: { activityId: 'school-vacation' },
    });
  });

  const january = (changes: object) =>
    document({
      events: document().state.events.map((event) =>
        event.id === 'teacher-vacation-january' ? { ...event, ...changes } : event,
      ),
    });

  test.each([
    ['dates that diverge from the field', january({ end: '2027-01-19' }), /divergem/],
    ['an effect that is not of vacations', january({ effect: 'note' }), /efeito ou categoria/],
    [
      'a category that is not of vacations',
      january({ category: 'recesso' }),
      /efeito ou categoria/,
    ],
    ['a link of its own', january({ activity: { activityId: 'diary' } }), /outro vínculo/],
    ['another name', january({ name: 'Férias' }), /outro nome/],
    ['part of the offers', january({ offers: ['integrado'] }), /todas as ofertas/],
    [
      'a period without its date',
      document({ events: document().state.events.slice(1) }),
      /não tem data derivada/,
    ],
    [
      'a date without its period',
      document({ teacherVacations: { firstStart: '2027-01-04', firstEnd: '2027-01-18' } }),
      /não tem período/,
    ],
    ['another format', document({ schemaVersion: 7 }), /formato 7 inesperado/],
  ])('stops, with nothing corrected, at %s', (_name, input, message) => {
    expect(() => convertToFormat7(input)).toThrow(Format7ConversionError);
    expect(() => convertToFormat7(input)).toThrow(message);
  });

  test('a listed date that already has a link stops the conversion', () => {
    const input = document({
      events: document().state.events.map((event) =>
        event.id === 'free' ? { ...event, activity: { activityId: 'diary' } } : event,
      ),
    });
    expect(() => convertToFormat7(input, ['free'])).toThrow(/já tem vínculo/);
  });

  test('a calendar without vacations only changes its format', () => {
    const before = document({ events: [], teacherVacations: undefined });
    expect(convertToFormat7(before).document.state).toEqual({
      schemaVersion: 7,
      offers,
      events: [],
    });
  });
});

describe('the frozen documents', () => {
  const current = new Map(storedCases().map((item) => [item.name, item]));

  test('the current fixtures are the result of the converter, but for the case with its own link', () => {
    for (const item of format6()) {
      const stored = current.get(item.name)!;
      if (item.name === 'Vínculos em conflito (fase 1)') {
        expect(() => convertToFormat7(item.content)).toThrow(/outro vínculo/);
        continue;
      }
      expect(JSON.parse(JSON.stringify(convertToFormat7(item.content).document.state))).toEqual(
        stored.content.state,
      );
      item.submissions.forEach((submission, index) =>
        expect(JSON.parse(JSON.stringify(convertToFormat7(submission).document.state))).toEqual(
          stored.submissions[index]!.state,
        ),
      );
    }
  });
});
