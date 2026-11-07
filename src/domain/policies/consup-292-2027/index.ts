import { civilDate } from '../../civil-date.ts';
import { calendarOffers, scopeStatus } from '../../calendar/offers.ts';
import type { CalendarPolicy } from '../contract.ts';
import { citation, rulesetChanges, rulesetVersion } from './history.ts';
import { rules, requirements, applicability, excluded } from './requirements.ts';
import { criteria } from './criteria.ts';
import { isTeacherVacation } from '../../reviews/parecer-items.ts';
import { observances } from './observances.ts';

const dayMinimums = { annual: 200, semester: 100 } as const;

/** Resolução CONSUP/IFPR nº 292/2026: structured requirements for technical and undergraduate offers. */
export const consup2922027Policy: CalendarPolicy = {
  year: 2027,
  configured: true,
  rulesetPrefix: 'consup-292-2027-',
  rulesetChanges,
  catalogue: rules,
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
      (offer) => !excluded(offer.kind) && scopeStatus(offer) !== 'own-regulation',
    )
      ? {
          start: civilDate('2027-02-01'),
          latestStart: civilDate('2027-02-15'),
          end: civilDate('2027-12-17'),
          basis: 'Arts. 4º e 8º da Resolução CONSUP/IFPR nº 292/2026',
        }
      : null,
  countingMinimums: (_state, offer) => {
    const configured = !excluded(offer.kind) && scopeStatus(offer) === 'covered';
    return {
      annual: configured ? { days: dayMinimums.annual, basis: `Art. 4º da ${citation}` } : null,
      semester: configured
        ? { days: dayMinimums.semester, basis: `Art. 4º, § 1º, da ${citation}` }
        : null,
    };
  },
  excludes: (offer) => excluded(offer.kind),
  schoolDay: {
    basis: 'Art. 5º, parágrafo único, da Resolução CONSUP/IFPR nº 292/2026',
    schoolDayActivities: [
      'campus-events',
      'internship-event',
      'robotics',
      'course-showcase',
      'women-week',
      'ethics-week',
      'cultural-week',
    ],
    meetings: [
      'council',
      'extraordinary-council',
      'pedagogical-meeting',
      'family-meeting',
      'alumni-meeting',
      'pedagogical-training',
      'collective-planning',
    ],
  },
  scope: {
    norm: 'Resolução 292',
    readinessIssue:
      'Confirme o escopo da Resolução 292: EaD, qualificação e pós-graduação exigem calendário e norma próprios; a oferta não identifica sozinha essa aplicabilidade.',
  },
  review: {
    source: {
      id: 'SEI 4422750',
      year: 2027,
      title: 'Resolução de diretrizes para o calendário acadêmico de 2027',
      norm: citation,
    },
    criteria,
    citation,
    citationUrl:
      'https://sei.ifpr.edu.br/sei/publicacoes/controlador_publicacoes.php?acao=publicacao_visualizar&id_documento=4606058&id_orgao_publicacao=0',
    evidence: 'coverage',
    dayMinimums,
    notes: {
      annual: [
        {
          text: 'Carga horária do PPC e cada curso, quando uma oferta reúne vários: a contagem é por oferta.',
        },
      ],
      minutes: [
        {
          text: 'Atas no processo SEI. Os 60 dias de antecedência do Art. 15 não são avaliados.',
        },
      ],
      XXVI: [{ text: 'Se o evento é aberto à comunidade.' }],
      'admission-regular': [{ text: 'Se o prazo foi ajustado, o registro do ajuste da Proens.' }],
    },
    excludeFromSearch: (criterionId, event) => criterionId === 'III' && isTeacherVacation(event),
    notEvaluated: [
      'Art. 3º, § 2º: prorrogação de prazos por feriado municipal ou recesso dele decorrente.',
      'Art. 9º: relação de cursos e vagas enviada à Proens até 31/05/2027.',
      'Art. 12: datas de Jogos do IFPR, SE²P²IN e outros eventos institucionais, quando definidas.',
      'Art. 13: finalidades dos sábados letivos.',
      'Art. 15: encaminhamento à Proens com 60 dias de antecedência do início do ano letivo.',
    ],
  },
  notices: {
    regularAdmission:
      'Art. 10: publique os editais do Processo Seletivo 2028 até 15/06/2027. Informe aqui a data da publicação; o prazo não a preenche automaticamente.',
  },
};
