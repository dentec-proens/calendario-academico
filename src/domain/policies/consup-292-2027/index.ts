import { calendarOffers } from '../../calendar/offers.ts';
import type { CalendarPolicy } from '../contract.ts';
import { citation, rulesetChanges, rulesetVersion } from './history.ts';
import { sections, requirements, applicability, excluded } from './requirements.ts';
import { criteria } from './criteria.ts';
import { observances } from './observances.ts';

const dayMinimums = { annual: 200, semester: 100 } as const;

/** Resolução CONSUP/IFPR nº 292/2026: structured requirements for technical and undergraduate offers. */
export const consup2922027Policy: CalendarPolicy = {
  year: 2027,
  configured: true,
  rulesetPrefix: 'consup-292-2027-',
  rulesetChanges,
  catalogue: sections,
  observances,
  rulesetVersion: (state) =>
    calendarOffers(state).some((offer) => !excluded(offer.kind))
      ? rulesetVersion
      : 'unconfigured:2027',
  requirements,
  applicability,
  applicabilityNote: (requirement, offer) => requirement.optionalFor?.[offer.kind] || undefined,
  window: (state) =>
    calendarOffers(state).some(
      (offer) => !excluded(offer.kind) && offer.scope?.status !== 'own-regulation',
    )
      ? {
          start: '2027-02-01',
          latestStart: '2027-02-15',
          end: '2027-12-17',
          basis: 'Arts. 4º e 8º da Resolução CONSUP/IFPR nº 292/2026',
        }
      : null,
  countingMinimums: (_state, offer) => {
    const configured = !excluded(offer.kind) && offer.scope?.status === 'covered';
    return {
      annual: configured ? { days: dayMinimums.annual, basis: `Art. 4º da ${citation}` } : null,
      semester: configured
        ? { days: dayMinimums.semester, basis: `Art. 4º, § 1º, da ${citation}` }
        : null,
    };
  },
  excludes: (offer) => excluded(offer.kind),
  scope: {
    norm: 'Resolução 292',
    readinessIssue:
      'Confirme o escopo da Resolução 292: EaD, qualificação e pós-graduação exigem calendário e norma próprios; a oferta não identifica sozinha essa aplicabilidade.',
  },
  explicitRecordOffers: true,
  intakeRequirements: true,
  windowInReadiness: true,
  review: {
    source: {
      id: 'SEI 4422750',
      year: 2027,
      title: 'Resolução de diretrizes para o calendário acadêmico de 2027',
      norm: citation,
    },
    criteria,
    citation,
    evidence: 'coverage',
    dayMinimums,
  },
  notices: {
    regularAdmission:
      'Art. 10: publicação do processo seletivo de 2028 até 15/06/2027. O prazo não preenche a data de publicação. Cronograma ajustado pela Proens exige conferência institucional.',
  },
};
