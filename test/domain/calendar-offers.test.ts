import { civilDate } from '../../src/domain/civil-date.ts';
import { describe, expect, it } from 'vitest';
import { definedStage } from '../helpers/activity-links.ts';
import type { CalendarContent, CalendarOffer } from '../../src/domain/calendar/model.ts';
import {
  kindOf,
  levelOf,
  offerLabel,
  kinds,
  organizationSummary,
  stageInTerm,
  stageTerm,
  stageCount,
  stageCycle,
  nextOfferId,
} from '../../src/domain/calendar/offers.ts';
import {
  assessmentStageRequirementPattern,
  calendarLimits,
} from '../../src/domain/calendar/config.ts';

const offer = (changes: Partial<CalendarOffer> = {}): CalendarOffer => ({
  id: 'graduacao',
  kind: 'graduacao',
  delivery: 'a-conferir',
  organization: 'anual',
  ...changes,
});

describe('identidade e tipo da oferta v4', () => {
  it('mantém identidades distintas sob o mesmo tipo normativo', () => {
    const chemistry = offer({ label: 'Licenciatura em Química' });
    const electrical = offer({
      id: 'graduacao-2',
      label: 'Engenharia Elétrica',
      organization: 'semestral',
    });
    expect(kindOf(chemistry)).toBe(kindOf(electrical));
    expect(offerLabel(chemistry)).toBe('Licenciatura em Química');
    expect(offerLabel(electrical)).toBe('Engenharia Elétrica');
    expect(offerLabel(offer())).toBe('Graduação');
    expect(levelOf(offer({ kind: 'integrado' }))).toBe('tecnico');
    expect(levelOf(offer({ kind: 'subsequente' }))).toBe('tecnico');
    expect(levelOf(electrical)).toBe('graduacao');
    expect(levelOf(offer({ kind: 'posgraduacao' }))).toBe('posgraduacao');
    expect(kinds({ offers: [electrical, offer({ kind: 'integrado' }), chemistry] })).toEqual([
      'integrado',
      'graduacao',
    ]);
    expect(calendarLimits.maximumOffers).toBe(12);
  });

  it('resume organizações; sem ofertas não há resumo', () => {
    expect(organizationSummary([])).toBeNull();
    expect(organizationSummary([offer()])).toBe('anual');
    expect(organizationSummary([offer(), offer({ organization: 'semestral' })])).toBe('misto');
  });

  it.each([2, 3, 4])('preserva %i etapas anuais', (perTerm) => {
    const annual = offer({ stages: { status: 'defined', perTerm } });
    expect(stageCount(annual)).toBe(perTerm);
    expect(stageTerm(annual, perTerm)).toBe('annual');
    expect(stageCycle(annual)).toBe({ 2: 'semestral', 3: 'trimestral', 4: 'bimestral' }[perTerm]);
  });

  it.each([1, 2])('reinicia a numeração com %i etapas por semestre', (perTerm) => {
    const semester = offer({ organization: 'semestral', stages: { status: 'defined', perTerm } });
    expect(stageCount(semester)).toBe(2 * perTerm);
    expect(stageInTerm(perTerm + 1, perTerm)).toEqual({ term: 2, number: 1 });
    expect(stageTerm(semester, perTerm)).toBe('first');
    expect(stageTerm(semester, perTerm + 1)).toBe('second');
    expect(stageTerm(semester, 2 * perTerm + 1)).toBeUndefined();
    expect(stageCycle(semester)).toBe(perTerm === 1 ? 'semestral' : 'bimestral');
  });

  it('não inventa etapas antes da confirmação da quantidade', () => {
    expect(stageCount(offer())).toBe(0);
    expect(stageTerm(offer(), 1)).toBeUndefined();
    expect(() => stageInTerm(1, 0)).toThrow();
    expect(() => stageInTerm(0, 2)).toThrow();
  });

  it('reserva ids citados em períodos, eventos e vínculos', () => {
    const state: CalendarContent = {
      schemaVersion: 6,
      offers: [offer()],
      weekdays: [],
      weekConfirmed: false,
      periods: [
        {
          id: 'p',
          start: civilDate('2027-01-01'),
          end: civilDate('2027-01-01'),
          association: { status: 'defined', offers: ['graduacao-2'], term: 'annual' },
        },
      ],
      events: [
        {
          id: 'e',
          name: '',
          start: civilDate('2027-01-01'),
          end: civilDate('2027-01-01'),
          effect: 'note',
          offers: ['graduacao-3'],
        },
        {
          id: 's',
          name: '',
          start: civilDate('2027-01-01'),
          end: civilDate('2027-01-01'),
          effect: 'note',
          offers: ['graduacao'],
          activity: definedStage('stage', 'graduacao-4', 'annual', 1),
        },
      ],
    };
    expect(nextOfferId(state, 'graduacao')).toBe('graduacao-5');
    expect(nextOfferId(state, 'subsequente')).toBe('subsequente');
    expect(assessmentStageRequirementPattern.test('stage-1:graduacao-2')).toBe(true);
    expect(assessmentStageRequirementPattern.test('stage-1:2graduacao')).toBe(false);
  });
});
