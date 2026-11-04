import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { storedCases } from '../helpers/stored-fixtures.ts';
import {
  convertToFormat6,
  type Format5Document,
  type Format5State,
} from '../../src/domain/calendar/normalization/convert-format-6.ts';

/** The stored documents as format 5 left them, the input of the migration. */
const format5Cases = (
  JSON.parse(
    readFileSync(new URL('../fixtures/stored/contents-format-5.json', import.meta.url), 'utf8'),
  ) as {
    cases: {
      name: string;
      year: number;
      content: Record<string, unknown>;
      submissions: Record<string, unknown>[];
    }[];
  }
).cases;

const offer = (id: string, count?: number) => ({
  id,
  label: id,
  kind: 'graduacao',
  delivery: 'presencial',
  organization: 'a-classificar' as const,
  ...(count === undefined ? {} : { stages: { status: 'reported' as const, count } }),
});
const period = (id: string, start: string, end: string) => ({
  id,
  name: id,
  start,
  end,
  targetDays: 100,
  association: { status: 'a-classificar' as const },
});
const first = period('p1', '2027-02-01', '2027-07-09');
const second = period('p2', '2027-07-26', '2027-12-17');
const date = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  name: id,
  start: '2027-03-01',
  end: '2027-03-01',
  effect: 'note',
  scope: { offers: ['a'], confirmed: true },
  ...fields,
});
const stage = (ordinal: number) => ({
  activityId: 'stage',
  offerId: 'a',
  position: { status: 'unclassified', reportedOrdinal: ordinal },
});
const convert = (state: Partial<Format5State>, institutionalSnapshot: unknown[] = []) =>
  convertToFormat6(
    {
      state: {
        schemaVersion: 5,
        rulesetVersion: 'consup-292-2027-v3',
        weekdays: [1, 2, 3, 4, 5],
        weekConfirmed: false,
        offers: [],
        periods: [],
        events: [],
        ...state,
      },
      institutionalSnapshot,
    } as unknown as Format5Document,
    2027,
  );
const converted = (result: ReturnType<typeof convert>) =>
  result.document.state as unknown as {
    offers: Record<string, unknown>[];
    periods: Record<string, unknown>[];
    events: Record<string, unknown>[];
    rulesetVersion?: string;
    schemaVersion: number;
  };

test('two periods without overlap are the semesters of the offers, in date order', () => {
  const result = convert({ offers: [offer('a', 4), offer('b')], periods: [second, first] });
  const state = converted(result);
  expect(state.offers[0]).toMatchObject({
    organization: 'semestral',
    stages: { status: 'defined', perTerm: 2 },
  });
  expect(state.offers[1]).toMatchObject({ organization: 'semestral' });
  expect(state.offers[1]).not.toHaveProperty('stages');
  expect(state.periods.map((item) => item.association)).toEqual([
    { status: 'defined', offers: ['a', 'b'], term: 'second' },
    { status: 'defined', offers: ['a', 'b'], term: 'first' },
  ]);
  expect(state.periods[0]).not.toHaveProperty('targetDays');
  expect(result.report.removedPeriods).toEqual([]);
});

test('an odd total decides by offer and the others keep the semesters', () => {
  const state = converted(
    convert({ offers: [offer('a', 3), offer('b', 2)], periods: [first, second] }),
  );
  expect(state.offers[0]).toMatchObject({
    organization: 'anual',
    stages: { status: 'defined', perTerm: 3 },
  });
  expect(state.offers[1]).toMatchObject({
    organization: 'semestral',
    stages: { status: 'defined', perTerm: 1 },
  });
  expect(state.periods[0].association).toMatchObject({ offers: ['b'] });
});

test('with only odd totals the two periods are removed and listed with their notices', () => {
  const notice = {
    publication: 'planned',
    admission: {
      type: 'transfer',
      year: 2027,
      term: 'annual',
      destinations: [{ offerId: 'a', periodId: 'p1' }],
    },
  };
  const result = convert({
    offers: [offer('a', 3)],
    periods: [first, second],
    events: [date('edital', { notice })],
  });
  expect(converted(result).periods).toEqual([]);
  expect(result.report.removedPeriods.map((item) => [item.id, item.notices])).toEqual([
    ['p1', ['edital']],
    ['p2', []],
  ]);
});

test('one period is shared as the annual period of the offers the migration decided', () => {
  const defined = {
    id: 'x',
    kind: 'integrado',
    delivery: 'presencial',
    organization: 'anual' as const,
  };
  const state = converted(convert({ offers: [offer('a'), offer('b'), defined], periods: [first] }));
  expect(state.periods[0].association).toEqual({
    status: 'defined',
    offers: ['a', 'b'],
    term: 'annual',
  });
  expect(state.periods[0]).not.toHaveProperty('targetDays');
});

test.each([
  ['two that overlap', [first, period('p2', '2027-06-01', '2027-12-17')]],
  ['three', [first, second, period('p3', '2027-12-18', '2027-12-20')]],
])('%s are removed and the offers become annual', (_name, periods) => {
  const state = converted(convert({ offers: [offer('a', 4)], periods }));
  expect(state.offers[0]).toMatchObject({
    organization: 'anual',
    stages: { status: 'defined', perTerm: 4 },
  });
  expect(state.periods).toEqual([]);
});

test('unassociated periods without an offer to take them are removed', () => {
  const defined = {
    id: 'x',
    kind: 'integrado',
    delivery: 'presencial',
    organization: 'anual' as const,
  };
  for (const periods of [[first], [first, second]]) {
    const result = convert({ offers: [defined], periods });
    expect(converted(result).periods).toEqual([]);
    expect(result.report.removedPeriods).toHaveLength(periods.length);
  }
});

test('only required cycles the offer has survive in intake', () => {
  const intake = {
    annual: { status: 'yes', required: true },
    first: { status: 'yes', required: true },
    second: { status: 'no' },
  };
  const result = convert({
    offers: [
      { ...offer('a'), intake },
      { ...offer('b'), intake: { annual: { status: 'unknown' } } },
    ],
  });
  const state = converted(result);
  expect(state.offers[0].intake).toEqual({ annual: true });
  expect(state.offers[1]).not.toHaveProperty('intake');
  expect(result.report.removedIntake).toEqual([{ offerId: 'a', term: 'first' }]);
});

test('a stage link always keeps its date, with a position that can only mean its ordinal', () => {
  const auto = { assessmentAutoStart: '2027-03-01' };
  const positions = (offers: unknown[], periods: unknown[], ordinals: number[]) =>
    converted(
      convert({
        offers: offers as Format5State['offers'],
        periods: periods as Format5State['periods'],
        events: ordinals.map((ordinal) =>
          date(`d${ordinal}`, { activity: stage(ordinal), ...auto }),
        ) as Format5State['events'],
      }),
    ).events.map((event) => (event.activity as { position: unknown }).position);
  const at = (term: string, number: number) => ({ status: 'defined', term, number });
  expect(positions([offer('a', 4)], [], [1, 4, 5])).toEqual([
    at('annual', 1),
    at('annual', 4),
    at('annual', 5),
  ]);
  expect(positions([offer('a')], [], [2])).toEqual([at('annual', 2)]);
  expect(positions([offer('a', 4)], [first, second], [1, 2, 3, 4, 5])).toEqual([
    at('first', 1),
    at('first', 2),
    at('second', 1),
    at('second', 2),
    at('first', 5),
  ]);
  expect(positions([offer('a')], [first, second], [3])).toEqual([at('first', 3)]);
  const state = converted(
    convert({ offers: [offer('a')], events: [date('d', { activity: stage(1), ...auto })] }),
  );
  expect(state.events[0]).toHaveProperty('assessmentAutoStart', '2027-03-01');
});

test('a defined position is never reinterpreted', () => {
  const position = { status: 'defined', term: 'second', number: 1 };
  const defined = {
    id: 'a',
    kind: 'graduacao',
    delivery: 'presencial',
    organization: 'anual' as const,
  };
  const state = converted(
    convert({
      offers: [defined],
      events: [
        date('d', { activity: { activityId: 'stage', offerId: 'a', position } }),
      ] as Format5State['events'],
    }),
  );
  expect(state.events[0].activity).toMatchObject({ position });
});

test('scope becomes the plain list of offers and the widened coverage is reported', () => {
  const unconfirmed = { offers: ['a'], confirmed: false };
  const result = convert({
    offers: [offer('a')],
    events: [
      date('linked', { scope: unconfirmed, activity: { activityId: 'robotics' } }),
      date('free', { scope: unconfirmed }),
    ] as Format5State['events'],
  });
  const { events } = converted(result);
  expect(events[0]).toMatchObject({ offers: ['a'] });
  expect(events[0]).not.toHaveProperty('scope');
  expect(result.report.coverageWidened).toEqual(['linked']);
});

test('inclusions of a decided offer outside its periods become notes', () => {
  const include = (id: string, start: string, end = start) =>
    date(id, { effect: 'include', start, end });
  const result = convert({
    offers: [offer('a')],
    periods: [first, second],
    events: [
      include('inside', '2027-03-06'),
      include('recess', '2027-07-17'),
      include('across', '2027-07-09', '2027-07-10'),
    ] as Format5State['events'],
  });
  expect(converted(result).events.map((event) => event.effect)).toEqual([
    'include',
    'note',
    'note',
  ]);
  expect(result.report.downgradedInclusions).toEqual(['recess', 'across']);
});

test('the institutional copy lists the offers it reaches', () => {
  const offers = [
    { id: 'a', kind: 'graduacao', delivery: 'presencial', organization: 'anual' },
    { id: 'b', kind: 'integrado', delivery: 'presencial', organization: 'anual' },
  ] as const;
  const result = convert({ offers: offers as unknown as Format5State['offers'] }, [
    { id: 'listed', offers: ['b'] },
    { id: 'kind', modalities: ['graduacao'] },
    { id: 'emptyOffers', offers: [] },
    { id: 'emptyKinds', modalities: [] },
    { id: 'neither' },
    { id: 'nobody', modalities: ['posgraduacao'] },
  ]);
  expect(result.document.institutionalSnapshot).toEqual([
    { id: 'listed', offers: ['b'] },
    { id: 'kind', offers: ['a'] },
    { id: 'emptyOffers', offers: ['a', 'b'] },
    { id: 'emptyKinds', offers: ['a', 'b'] },
    { id: 'neither', offers: ['a', 'b'] },
  ]);
  expect(result.report.removedSnapshotEntries).toEqual(['nobody']);
  expect(result.report.widenedSnapshotEntries).toEqual(['emptyOffers', 'emptyKinds']);
});

test('fields with no use go and the adjusted deadline stays', () => {
  const state = converted(
    convert({
      offers: [{ ...offer('a'), organizationBasis: 'antigo' }],
      events: [
        date('d', {
          notice: {
            publication: 'planned',
            admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
          },
          deadlineAdjustment: { date: '2027-06-20', reviewed: true },
        }),
      ] as Format5State['events'],
    }),
  );
  expect(state.offers[0]).not.toHaveProperty('organizationBasis');
  expect(state.events[0].deadlineAdjustment).toEqual({ date: '2027-06-20' });
});

test('the conversion keeps the ruleset version, is deterministic and leaves its input intact', () => {
  for (const item of format5Cases) {
    const input = { ...item.content } as unknown as Format5Document;
    const before = JSON.stringify(input);
    const once = convertToFormat6(input, item.year);
    expect(JSON.stringify(input)).toBe(before);
    expect(once).toEqual(convertToFormat6(input, item.year));
    const state = once.document.state;
    expect(state.schemaVersion).toBe(6);
    expect(state.rulesetVersion).toBe(input.state.rulesetVersion);
    expect(JSON.stringify(state)).not.toMatch(
      /a-classificar|"reported"|"unclassified"|"confirmed"/,
    );
  }
});

test('a document outside format 5 is refused', () => {
  expect(() =>
    convertToFormat6(
      {
        state: { schemaVersion: 6 },
        institutionalSnapshot: [],
      } as unknown as Format5Document,
      2027,
    ),
  ).toThrow('só lê o formato 5');
});

test('the stored fixtures are what the conversion gives from format 5', () => {
  const stored = storedCases();
  format5Cases.forEach((item, index) => {
    const convertedOf = (document: Record<string, unknown>) =>
      convertToFormat6(document as unknown as Format5Document, item.year).document;
    expect(stored[index].content, item.name).toEqual(convertedOf(item.content));
    item.submissions.forEach((submission, at) => {
      const value = convertedOf(submission);
      expect(stored[index].submissions[at], item.name).toEqual({
        ...value,
        contentHash: contentHash(value as never),
      });
    });
  });
});

test('a document the normalization refuses stops the conversion', () => {
  expect(() =>
    convert({
      offers: [offer('a')],
      events: [
        date('d', { scope: { offers: ['outra'], confirmed: true } }),
      ] as Format5State['events'],
    }),
  ).toThrow('fora do calendário');
});

test('a cycle link the assigned organization does not generate is in the report', () => {
  const link = (term: string) => ({ activity: { activityId: 'final', term } });
  const { report } = convert({
    offers: [offer('a')],
    periods: [first, second],
    events: [
      date('annual', link('annual')),
      date('first', { ...link('first'), start: '2027-07-01', end: '2027-07-01' }),
    ] as Format5State['events'],
  });
  expect(report.linksToReview).toEqual([{ eventId: 'annual', issue: 'not-generated' }]);
});
