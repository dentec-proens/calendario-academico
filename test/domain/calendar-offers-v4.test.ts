import { describe, expect, it } from 'vitest';
import type { CalendarContentV4, CalendarOffer } from '../../src/domain/calendar/model.ts';
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
  secondSemesterIntake,
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

  it('resume organizações, incluindo ofertas a conferir', () => {
    expect(organizationSummary([])).toBe('a-classificar');
    expect(organizationSummary([offer()])).toBe('anual');
    expect(organizationSummary([offer(), offer({ organization: 'semestral' })])).toBe('misto');
    expect(organizationSummary([offer(), offer({ organization: 'a-classificar' })])).toBe(
      'a-classificar',
    );
  });

  it('não confunde ingresso desconhecido com ausência confirmada', () => {
    expect(secondSemesterIntake([offer()])).toBeUndefined();
    expect(secondSemesterIntake([])).toBeUndefined();
    expect(secondSemesterIntake([offer({ intake: { second: { status: 'no' } } })])).toBe(false);
    expect(
      secondSemesterIntake([offer(), offer({ intake: { second: { status: 'no' } } })]),
    ).toBeUndefined();
    expect(secondSemesterIntake([offer(), offer({ intake: { second: { status: 'yes' } } })])).toBe(
      true,
    );
  });

  it.each([2, 3, 4])('preserva %i etapas anuais', (perTerm) => {
    const annual = offer({ stages: { perTerm } });
    expect(stageCount(annual)).toBe(perTerm);
    expect(stageTerm(annual, perTerm)).toBe('annual');
    expect(stageCycle(annual)).toBe({ 2: 'semestral', 3: 'trimestral', 4: 'bimestral' }[perTerm]);
  });

  it.each([1, 2])('reinicia a numeração com %i etapas por semestre', (perTerm) => {
    const semester = offer({ organization: 'semestral', stages: { perTerm } });
    expect(stageCount(semester)).toBe(2 * perTerm);
    expect(stageInTerm(perTerm + 1, perTerm)).toEqual({ term: 2, number: 1 });
    expect(stageTerm(semester, perTerm)).toBe('first');
    expect(stageTerm(semester, perTerm + 1)).toBe('second');
    expect(stageTerm(semester, 2 * perTerm + 1)).toBeUndefined();
    expect(stageCycle(semester)).toBe(perTerm === 1 ? 'semestral' : 'bimestral');
  });

  it('não inventa etapas antes da confirmação da organização e da quantidade', () => {
    expect(stageCount(offer())).toBe(0);
    expect(stageTerm(offer(), 1)).toBeUndefined();
    expect(
      stageCycle(offer({ organization: 'a-classificar', stages: { perTerm: 2 } })),
    ).toBeUndefined();
    expect(() => stageInTerm(1, 0)).toThrow();
    expect(() => stageInTerm(0, 2)).toThrow();
  });

  it('reserva ids citados em períodos, eventos e vínculos', () => {
    const state: CalendarContentV4 = {
      schemaVersion: 4,
      offers: [offer()],
      weekdays: [],
      weekConfirmed: false,
      periods: [
        {
          id: 'p',
          start: '',
          end: '',
          association: { status: 'defined', offers: ['graduacao-2'], term: 'annual' },
        },
      ],
      events: [
        { id: 'e', name: '', start: '', end: '', kind: 'note', offers: ['graduacao-3'] },
        {
          id: 's',
          name: '',
          start: '',
          end: '',
          kind: 'note',
          requirementId: 'stage-1:graduacao-4',
        },
      ],
    };
    expect(nextOfferId(state, 'graduacao')).toBe('graduacao-5');
    expect(nextOfferId(state, 'subsequente')).toBe('subsequente');
    expect(assessmentStageRequirementPattern.test('stage-1:graduacao-2')).toBe(true);
    expect(assessmentStageRequirementPattern.test('stage-1:2graduacao')).toBe(false);
  });
});
