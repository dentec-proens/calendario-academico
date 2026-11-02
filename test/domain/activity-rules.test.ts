import { describe, expect, test } from 'vitest';
import { operationalRules } from '../../src/domain/calendar/activities/operational-checklist.ts';
import {
  declareRules,
  expandRules,
  type ActivityRule,
} from '../../src/domain/calendar/activities/rules.ts';
import type { AssessmentSettings } from '../../src/domain/calendar/model.ts';
import { rules as rules2027 } from '../../src/domain/policies/consup-292-2027/requirements.ts';

const state: AssessmentSettings = {
  year: 2027,
  offers: [
    {
      id: 'integrado',
      kind: 'integrado',
      delivery: 'a-conferir',
      organization: 'anual',
      stages: { status: 'defined', perTerm: 2 },
    },
    {
      id: 'graduacao',
      kind: 'graduacao',
      delivery: 'a-conferir',
      organization: 'semestral',
      stages: { status: 'defined', perTerm: 1 },
    },
  ],
};

describe('ActivityRule', () => {
  test('composes the repetition base and the common values into every rule', () => {
    const [stage, own] = declareRules(
      { repeat: 'stage', each: { basis: 'Art. 11, I', category: 'limite' } },
      [
        { id: 'stage', name: 'Etapa', group: 'teaching' },
        { id: 'results', name: 'Resultados', group: 'teaching', category: 'prazo' },
      ],
    );
    expect(stage).toMatchObject({ repeat: 'stage', basis: 'Art. 11, I', category: 'limite' });
    // A rule's own value wins; an explicitly undefined one keeps the common value.
    expect(own).toMatchObject({ repeat: 'stage', category: 'prazo' });
    expect(
      declareRules({ repeat: 'once', each: { basis: 'Art. 10' } }, [
        { id: 'notice', name: 'Edital', group: 'admission', basis: undefined },
      ])[0].basis,
    ).toBe('Art. 10');
  });

  test('every declared rule of the 2027 policy and of the operational catalogue carries its base', () => {
    const bases = (rules: readonly ActivityRule[]) =>
      Object.fromEntries(rules.map((rule) => [rule.id, rule.repeat]));
    // Art. 11, XII: PIT, RIT and Plano de Ensino in each reference semester; cycles follow offers.
    expect(bases(rules2027)).toMatchObject({
      stage: 'stage',
      council: 'stage',
      final: 'cycle',
      enrolment: 'cycle',
      'teaching-plan': 'semester',
      pit: 'semester',
      'family-meeting': 'once',
    });
    expect(bases(operationalRules())).toMatchObject({
      'teaching-plan': 'cycle',
      enrolment: 'semester',
    });
    for (const rule of [...rules2027, ...operationalRules()])
      if (rule.repeat === 'cycle') expect(typeof rule.cycles).toBe('function');
  });

  test('rules of one base expand slot by slot, in declaration order, where the base first appears', () => {
    const cycles = () => [{ n: 0, term: 'annual' as const }];
    const rules = [
      ...declareRules({ repeat: 'semester' }, [{ id: 'pit', name: 'PIT', group: 'teaching' }]),
      ...declareRules({ repeat: 'once' }, [{ id: 'robotics', name: 'OBR', group: 'campus' }]),
      ...declareRules({ repeat: 'semester' }, [{ id: 'rit', name: 'RIT', group: 'teaching' }]),
      ...declareRules({ repeat: 'cycle', cycles }, [
        { id: 'final', name: 'Final', group: 'teaching' },
      ]),
      ...declareRules({ repeat: 'cycle', cycles: () => [{ n: 1, term: 'first' as const }] }, [
        { id: 'diary', name: 'Diário', group: 'teaching' },
      ]),
    ];
    expect(expandRules(rules, state).map(({ row }) => row.id)).toEqual([
      'pit-1',
      'rit-1',
      'pit-2',
      'rit-2',
      'robotics',
      'final-0',
      'diary-1',
    ]);
  });

  test('expansion keeps the persisted identifiers and reads plan fields from the rule', () => {
    const rows = expandRules(rules2027, state).map(({ row }) => row);
    expect(rows.filter((row) => row.id.startsWith('stage-')).map((row) => row.id)).toEqual([
      'stage-1:integrado',
      'stage-2:integrado',
      'stage-1:graduacao',
      'stage-2:graduacao',
    ]);
    expect(rows.find((row) => row.id === 'stage-2:graduacao')).toMatchObject({
      offerId: 'graduacao',
      term: 'second',
      modalities: ['graduacao'],
      defaultCategory: 'limite',
      variant: 'stage',
      reviewCriterionId: 'I',
      name: '1ª etapa de avaliação do 2º semestre — início e término — semestral',
    });
    expect(rows.find((row) => row.id === 'final-1')).toMatchObject({
      term: 'first',
      offerIds: ['graduacao'],
      modalities: ['graduacao'],
    });
    expect(rows.find((row) => row.id === 'pit-1')).toMatchObject({
      term: 'first',
      basis: 'Art. 11, XII',
      reviewCriterionId: 'XII',
    });
    expect(rows.find((row) => row.id === 'pedagogical-training')).toMatchObject({
      variant: 'hours',
    });
    for (const row of rows) {
      expect(row).not.toHaveProperty('repeat');
      expect(row).not.toHaveProperty('cycles');
      expect(row).not.toHaveProperty('title');
    }
  });
});
