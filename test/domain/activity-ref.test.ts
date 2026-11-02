import { describe, expect, test } from 'vitest';
import {
  activityFromKey,
  activityIds,
  activityKey,
  activityRef,
  type ActivityBase,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { operationalRules } from '../../src/domain/calendar/activities/operational-checklist.ts';
import { rules as rules2027 } from '../../src/domain/policies/consup-292-2027/requirements.ts';
import { DomainError } from '../../src/domain/errors.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { calendarSchemaVersion, type AssessmentSettings } from '../../src/domain/calendar/model.ts';

/**
 * `ActivityRef` (plan `docs/plans/2026-11-02-atividades-e-datas.md`, section 5.1; phase 2,
 * step 9a): the link names a declared activity in the shape of its repetition base, validated at
 * runtime against the declared rules, never by prefix; `activityKey()` groups and addresses it.
 */
const stage = (
  activityId: string,
  position: unknown = { status: 'unclassified', reportedOrdinal: 1 },
) => ({
  activityId,
  offerId: 'integrado',
  position,
});

describe('activity IDs by repetition base', () => {
  test('come from the declared rules of the policies and the operational catalogue', () => {
    const declared = (base: ActivityBase) =>
      new Set(
        [...rules2027, ...operationalRules()]
          .filter((rule) => rule.repeat === base)
          .map((rule) => rule.id),
      );
    for (const base of ['once', 'cycle', 'semester', 'stage'] as const)
      expect([...activityIds(base)].sort()).toEqual([...declared(base)].sort());
    expect([...activityIds('stage')].sort()).toEqual([
      'council',
      'pedagogical-meeting',
      'results',
      'stage',
    ]);
    // The same declaration may repeat by different bases in different catalogues: the PIT plan of
    // 2027 is per reference semester, per cycle in the operational catalogue; rematrícula the
    // other way round. Each base keeps its own shape.
    for (const id of ['teaching-plan', 'enrolment']) {
      expect(activityIds('cycle').has(id), id).toBe(true);
      expect(activityIds('semester').has(id), id).toBe(true);
    }
  });

  test('never contain the key separator', () => {
    for (const base of ['once', 'cycle', 'semester', 'stage'] as const)
      for (const id of activityIds(base)) expect(id).not.toContain(':');
  });
});

describe('activityRef() validates each base', () => {
  test.each<[string, unknown]>([
    ['single activity', { activityId: 'family-meeting' }],
    ['offer cycle', { activityId: 'final', term: 'annual' }],
    ['reference semester', { activityId: 'pit', semester: 'second' }],
    ['unclassified stage', stage('results', { status: 'unclassified', reportedOrdinal: 3 })],
    ['defined stage', stage('council', { status: 'defined', term: 'second', number: 1 })],
    ['stage meeting', stage('pedagogical-meeting')],
  ])('accepts a %s', (_name, value) => {
    expect(activityRef(value)).toEqual(value);
  });

  test('refuses a meeting with families, or any single activity, with a stage position', () => {
    for (const activityId of ['family-meeting', 'extraordinary-council', 'alumni-meeting'])
      expect(() => activityRef(stage(activityId)), activityId).toThrow(
        `Atividade vinculada inválida: atividade “${activityId}” não declarada por etapa.`,
      );
  });

  test('refuses an arbitrary string that starts with a valid ID, in every base', () => {
    for (const value of [
      stage('stage-1:integrado'),
      stage('results-2'),
      stage('stage '),
      stage('councils'),
      { activityId: 'final-1', term: 'first' },
      { activityId: 'final-appealing', term: 'first' },
      { activityId: 'pit-1', semester: 'first' },
      { activityId: 'family-meeting-2' },
      { activityId: 'family' },
      { activityId: 'stage-1:integrado' },
    ])
      expect(() => activityRef(value), JSON.stringify(value)).toThrow(DomainError);
  });

  test('refuses a declaration in the shape of another base', () => {
    expect(() => activityRef({ activityId: 'final', semester: 'first' })).toThrow(
      'não declarada por semestre de referência',
    );
    expect(() => activityRef({ activityId: 'rit', term: 'first' })).toThrow(
      'não declarada por ciclo da oferta',
    );
    expect(() => activityRef({ activityId: 'stage' })).toThrow(
      'não declarada como atividade única',
    );
  });

  test('keeps the reference semester apart from the offer cycle', () => {
    expect(() => activityRef({ activityId: 'pit', semester: 'annual' })).toThrow(
      'semestre de referência “annual” desconhecido',
    );
    const semester = activityRef({ activityId: 'teaching-plan', semester: 'first' });
    const cycle = activityRef({ activityId: 'teaching-plan', term: 'first' });
    expect(semester).not.toEqual(cycle);
    expect(activityKey(semester)).not.toBe(activityKey(cycle));
  });

  test.each<[string, unknown]>([
    ['no object', 'family-meeting'],
    ['an array', [{ activityId: 'family-meeting' }]],
    ['no ID', { term: 'first' }],
    ['a non-string ID', { activityId: 3 }],
    ['an unknown cycle', { activityId: 'final', term: 'third' }],
    [
      'both a cycle and a semester',
      { activityId: 'teaching-plan', term: 'first', semester: 'first' },
    ],
    ['an extra field', { activityId: 'family-meeting', note: 'x' }],
    [
      'a stage without offer',
      { activityId: 'stage', position: { status: 'unclassified', reportedOrdinal: 1 } },
    ],
    ['a stage with an empty offer', { ...stage('stage'), offerId: '' }],
    ['a stage without position', { activityId: 'stage', offerId: 'integrado' }],
    ['a zero ordinal', stage('stage', { status: 'unclassified', reportedOrdinal: 0 })],
    ['a fractional ordinal', stage('stage', { status: 'unclassified', reportedOrdinal: 1.5 })],
    [
      'an unclassified position with a cycle',
      stage('stage', { status: 'unclassified', reportedOrdinal: 1, term: 'first' }),
    ],
    ['a defined position without cycle', stage('stage', { status: 'defined', number: 1 })],
    [
      'a defined position with an unknown cycle',
      stage('stage', { status: 'defined', term: 'third', number: 1 }),
    ],
    [
      'a defined position numbered zero',
      stage('stage', { status: 'defined', term: 'annual', number: 0 }),
    ],
    ['an unknown position status', stage('stage', { status: 'reported', reportedOrdinal: 1 })],
  ])('refuses %s', (_name, value) => {
    expect(() => activityRef(value)).toThrow(DomainError);
  });
});

describe('activityKey()', () => {
  const refs = [
    { activityId: 'family-meeting' },
    { activityId: 'final', term: 'annual' },
    { activityId: 'final', term: 'first' },
    { activityId: 'teaching-plan', term: 'first' },
    { activityId: 'teaching-plan', semester: 'first' },
    { activityId: 'pit', semester: 'second' },
    stage('stage', { status: 'unclassified', reportedOrdinal: 2 }),
    stage('stage', { status: 'defined', term: 'annual', number: 2 }),
    stage('stage', { status: 'defined', term: 'first', number: 2 }),
    stage('results', { status: 'defined', term: 'first', number: 2 }),
    { ...stage('stage', { status: 'defined', term: 'first', number: 2 }), offerId: 'graduacao' },
    { ...stage('stage', { status: 'defined', term: 'first', number: 2 }), offerId: 'a:b' },
    { ...stage('stage', { status: 'defined', term: 'first', number: 2 }), offerId: 'a' },
  ].map((value) => activityRef(value));

  test('names the declaration, base and position, with the offer last', () => {
    expect(refs.slice(0, 8).map(activityKey)).toEqual([
      'family-meeting',
      'final:cycle:annual',
      'final:cycle:first',
      'teaching-plan:cycle:first',
      'teaching-plan:semester:first',
      'pit:semester:second',
      'stage:stage:unclassified:2:integrado',
      'stage:stage:annual:2:integrado',
    ]);
  });

  test('is injective and pure', () => {
    const keys = refs.map(activityKey);
    expect(new Set(keys).size).toBe(refs.length);
    const before = structuredClone(refs);
    expect(refs.map(activityKey)).toEqual(keys);
    expect(refs).toEqual(before);
  });

  test('does not depend on the order of the fields', () => {
    const reordered: ActivityRef = activityRef({
      position: { number: 2, term: 'first', status: 'defined' },
      offerId: 'integrado',
      activityId: 'results',
    });
    expect(activityKey(reordered)).toBe('results:stage:first:2:integrado');
  });
});

describe('activityFromKey() validates a complete key read from a URL', () => {
  test('returns the link of every key activityKey() produces, for every generated row', () => {
    const offers = ['anual', 'semestral', 'a-classificar'] as const;
    const keys = new Set<string>();
    for (const year of [2026, 2027])
      for (const organization of offers) {
        const state: AssessmentSettings = {
          year,
          schemaVersion: calendarSchemaVersion,
          offers: [
            {
              id: 'integrado',
              kind: 'integrado',
              delivery: 'a-conferir',
              organization,
              stages:
                organization === 'a-classificar'
                  ? { status: 'reported', count: 3 }
                  : { status: 'defined', perTerm: organization === 'anual' ? 2 : 1 },
            },
          ],
        };
        for (const row of activityPlan(state)) {
          const key = activityKey(row.activity);
          keys.add(key);
          expect(activityFromKey(key), key).toEqual(row.activity);
        }
      }
    // Every base appears: single, cycle, reference semester and stage.
    for (const pattern of [/^[a-z-]+$/, /:cycle:/, /:semester:/, /:stage:/])
      expect(
        [...keys].some((key) => pattern.test(key)),
        String(pattern),
      ).toBe(true);
  });

  test.each([
    'stage:stage:unclassified:3:integrado',
    'results:stage:first:2:graduacao',
    'pit:semester:second',
  ])('accepts the declared key %s, generated or not', (key) => {
    expect(activityKey(activityFromKey(key)!)).toBe(key);
  });

  test.each([
    ['format 4 identifiers', 'final-1'],
    ['format 4 stage identifiers', 'stage-1:integrado'],
    ['an undeclared activity', 'unknown-activity'],
    ['a prefix of a key', 'final:cycle'],
    ['a key in another base', 'family-meeting:cycle:first'],
    ['a single activity named by a repeated ID', 'final'],
    ['an unknown cycle', 'final:cycle:third'],
    ['an unknown reference semester', 'pit:semester:annual'],
    ['a meeting with a stage position', 'family-meeting:stage:annual:1:integrado'],
    ['a stage without offer', 'stage:stage:annual:1:'],
    ['a stage without number', 'stage:stage:annual::integrado'],
    ['a non-canonical number', 'stage:stage:annual:01:integrado'],
    ['a zero ordinal', 'stage:stage:unclassified:0:integrado'],
    ['an unknown stage status', 'stage:stage:pending:1:integrado'],
    ['extra parts', 'final:cycle:first:integrado'],
    ['an empty key', ''],
  ])('refuses %s', (_, key) => {
    expect(activityFromKey(key)).toBeUndefined();
  });
});
