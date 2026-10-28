import { normativeDayMinimums, legacyDayMinimums } from './calendar-config.ts';
import type { CalendarActivity, TeachingState } from './domain-types.ts';
import { calendarModalities, modalityLabels } from './modalities.ts';
import { reviewNorm } from './review-presentation.ts';
import { evaluateCalendar as calendarResult } from './evaluation.ts';
import {
  activityCoverage,
  organizationForModality,
  periodsForModality,
  rulesetVersion,
  calendarWindow,
} from './calendar-rules/index.ts';

export const reviewSource = {
  id: 'SEI 3959640',
  year: 2026,
  title: 'Parecer técnico-pedagógico de calendário acadêmico e administrativo',
  norm: 'Resolução Consup/IFPR 259, de 27/11/2025',
};
const rows: [string, string, number, string, string | null][] = [
  [
    'annual',
    'Mínimo de 200 dias letivos anuais e carga horária do PPC',
    1,
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'semester',
    '100 dias por semestre para oferta semestral',
    1,
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'window',
    'Janela do ano letivo: 04/02 a 18/12/2026; início até 28/02/2026',
    1,
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'minutes',
    'Extratos das atas de aprovação pelo CGPC e Codic',
    1,
    'Instrução processual',
    'cgpc|codic|ata',
  ],
  [
    'I',
    'Início e término de cada período: bimestre/trimestre, semestre e ano',
    1,
    'Art. 7º, I',
    null,
  ],
  ['II', 'Feriados e recessos acadêmicos e administrativos', 1, 'Art. 7º, II', 'feriado|recesso'],
  ['III', 'Períodos de férias escolares', 1, 'Art. 7º, III', 'ferias'],
  [
    'IV',
    'Férias docentes: 45 dias, preferencialmente coincidentes com férias escolares',
    1,
    'Art. 7º, IV',
    'ferias.*docent|docent.*ferias',
  ],
  [
    'V',
    'Matrícula e ajustes de veteranos dos cursos subsequentes e de graduação',
    1,
    'Art. 7º, V',
    'matricula',
  ],
  [
    'VI',
    'Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio: uma vez no anual; duas no semestral',
    1,
    'Art. 7º, VI',
    'aproveitamento|certificacao|equivalencia',
  ],
  [
    'VII',
    'Trancamento de curso e cancelamento de componente: subsequentes e graduação',
    1,
    'Art. 7º, VII',
    'trancamento|cancelamento',
  ],
  [
    'VIII',
    'Editais de transferência, reingresso e portadores de diploma antes do período: uma vez no anual; duas no semestral',
    2,
    'Art. 7º, VIII',
    'transferencia|reingresso|diploma',
  ],
  [
    'IX',
    'Lançamento dos resultados e frequência de cada etapa',
    2,
    'Art. 7º, IX',
    'resultado|rendimento|frequencia',
  ],
  [
    'X',
    'Lançamento dos resultados finais e frequência',
    2,
    'Art. 7º, X',
    'resultado.*fina|fina.*resultado',
  ],
  ['XI', 'Fechamento e entrega dos diários de classe', 2, 'Art. 7º, XI', 'diario'],
  [
    'XII',
    'Submissão do PIT e do Plano de Ensino à direção',
    2,
    'Art. 7º, XII',
    '\\bpit\\b|plano.*ensino|plano individual',
  ],
  [
    'XIII',
    'Conselhos/coletivos e reuniões pedagógicas após resultados parciais',
    2,
    'Art. 7º, XIII',
    'conselho|coletivo|reuniao pedagogica',
  ],
  [
    'XIV',
    'Prazo para estudantes solicitarem revisão de resultados finais',
    2,
    'Art. 7º, XIV',
    'revisao.*resultado',
  ],
  [
    'XV',
    'Conselhos/coletivos extraordinários para revisão de resultados',
    2,
    'Art. 7º, XV',
    'extraordinario',
  ],
  [
    'XVI',
    'Reuniões com familiares, responsáveis e comunidade',
    2,
    'Art. 7º, XVI',
    'familia|responsave|comunidade',
  ],
  [
    'XVII',
    'Eventos de ensino, pesquisa, extensão e inovação do campus',
    2,
    'Art. 7º, XVII',
    'ensino|pesquisa|extensao|inovacao',
  ],
  ['XVIII', 'Encontro dos egressos', 2, 'Art. 7º, XVIII', 'egresso'],
  ['XIX', 'Evento sobre estágios', 2, 'Art. 7º, XIX', 'estagio'],
  [
    'XX',
    'Fase local da Olimpíada Brasileira de Robótica até 31/08/2026',
    2,
    'Art. 7º, XX',
    'robotica|\\bobr\\b',
  ],
  ['XXI', 'Mostra de Cursos até 30/09/2026', 2, 'Art. 7º, XXI', 'mostra.*curso'],
  ['XXII', 'Formação pedagógica: mínimo de 40 horas anuais', 2, 'Art. 7º, XXII', 'formacao'],
  [
    'XXIII',
    'Planejamento/replanejamento coletivo: mínimo de 20 horas anuais',
    2,
    'Art. 7º, XXIII',
    'planejamento',
  ],
  [
    'XXIV',
    'Semana de Valorização de Mulheres que Fizeram História em março: obrigatória nos técnicos e facultativa na graduação',
    2,
    'Art. 7º, XXIV',
    'mulher',
  ],
  [
    'XXV',
    'Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',
    2,
    'Art. 7º, XXV',
    'cultural|interescolar',
  ],
];
const normalize = (s: string) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export const reviewCriteria = rows.map(([id, title, page, item, pattern]) => ({
  id,
  title,
  page,
  item,
  pattern,
}));

export function reviewSourceFor(year: number) {
  return year === 2027
    ? {
        id: 'SEI 4422750',
        year: 2027,
        title: 'Resolução de diretrizes para o calendário acadêmico de 2027',
        norm: 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026',
      }
    : reviewSource;
}
export function reviewCriteriaFor(year: number) {
  if (year !== 2027) return reviewCriteria;
  return [
    ...reviewCriteria.map((criterion) => ({
      ...criterion,
      page: [
        'XII',
        'XIII',
        'XIV',
        'XV',
        'XVI',
        'XVII',
        'XVIII',
        'XIX',
        'XX',
        'XXI',
        'XXII',
        'XXIII',
        'XXIV',
        'XXV',
      ].includes(criterion.id)
        ? 4
        : 3,
      item:
        criterion.id === 'annual'
          ? 'Art. 4º'
          : criterion.id === 'semester'
            ? 'Art. 4º, § 1º'
            : criterion.id === 'window'
              ? 'Art. 8º'
              : criterion.item.replace('Art. 7º', 'Art. 11'),
      title:
        criterion.id === 'window'
          ? 'Janela do ano letivo: 01/02 a 17/12/2027; início até 15/02/2027'
          : criterion.id === 'XII'
            ? 'Plano de Ensino, PIT e RIT em cada semestre'
            : criterion.id === 'XXIV'
              ? 'Semana de Valorização de Mulheres que Fizeram História — segunda semana de março'
              : criterion.id === 'XXV'
                ? 'Semana da Ética e da Cidadania — primeira semana de maio'
                : criterion.title.replaceAll('2026', '2027'),
      pattern: criterion.id === 'XXV' ? 'etica|cidadania' : criterion.pattern,
    })),
    {
      id: 'XXVI',
      title:
        'Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',
      page: 4,
      item: 'Art. 11, XXVI',
      pattern: 'cultural|interescolar',
    },
    {
      id: 'admission-regular',
      title:
        'Editais do Processo Seletivo 2028 até 15/06/2027; eventual ajuste pela Proens documentado',
      page: 3,
      item: 'Art. 10',
      pattern: 'processo seletivo',
    },
  ];
}

export function reviewSupport<
  T extends {
    id: string;
    name: string;
    version: number;
    state: TeachingState & { campus?: string };
  },
>(
  record: T,
  events: (Pick<
    CalendarActivity,
    'id' | 'name' | 'start' | 'end' | 'evidence' | 'category' | 'modalities'
  > &
    Partial<
      Pick<
        CalendarActivity,
        | 'kind'
        | 'requirementId'
        | 'recordType'
        | 'publicationStatus'
        | 'admission'
        | 'deadlineAdjustment'
        | 'hours'
      >
    >)[],
) {
  let result: ReturnType<typeof calendarResult> | null = null,
    error: string | null = null,
    provisional = false;
  try {
    result = calendarResult(
      record.state,
      events.map((event) => ({ ...event, kind: event.kind ?? 'note' })),
    );
  } catch (cause) {
    error = 'Contagem indisponível: ' + (cause instanceof Error ? cause.message : String(cause));
    // A numerical preview uses only registered weekdays and events, never an assumed week.
    if (record.state.weekdays?.length) {
      try {
        result = calendarResult(
          {
            ...record.state,
            weekConfirmed: true,
            weekEvidence: record.state.weekEvidence || 'Prévia de dados cadastrados',
          },
          events.map((e) => ({
            ...e,
            kind: e.kind ?? 'note',
            evidence: e.evidence || 'Prévia de dados cadastrados',
          })),
        );
        provisional = true;
        error = 'Contagem provisória: confirme a semana letiva e as fontes dos eventos no editor.';
      } catch {
        /* Invalid periods or dates must not produce a misleading total. */
      }
    }
  }
  const counts = result ? Object.entries(result.byModality) : [];
  const countLabel = provisional ? 'Contagem provisória dos dados cadastrados. ' : '';
  const source = reviewSourceFor(record.state.year);
  const sameYear = record.state.year === source.year;
  const normativeScopeConfirmed =
    record.state.year !== 2027 || record.state.scopeConfirmation?.status === 'covered';
  const window = calendarWindow(record.state);
  const windowStart = window?.start ?? '',
    latestStart = window?.latestStart ?? '',
    windowEnd = window?.end ?? '';
  const coverage =
    record.state.year === 2027
      ? activityCoverage({
          ...record.state,
          events: events.map((event) => ({ ...event, kind: event.kind ?? 'note' })),
        })
      : [];
  return {
    source,
    rulesetVersion: rulesetVersion(record.state),
    sameYear,
    officialApproval: false,
    calendar: {
      id: record.id,
      name: record.name,
      campus: record.state.campus,
      year: record.state.year,
      offer: record.state.offer,
      modalities: calendarModalities(record.state),
      regime: record.state.regime,
      version: record.version,
    },
    criteria: reviewCriteriaFor(record.state.year).map((c) => {
      const dayMinimums =
        record.state.year === normativeDayMinimums.year ? normativeDayMinimums : legacyDayMinimums;
      let signal: string = 'Conferência documental necessária.';
      let candidates: (Pick<CalendarActivity, 'id' | 'name' | 'start' | 'end'> & {
        evidence: string;
      })[] = [];
      if (c.pattern) {
        const pattern = new RegExp(c.pattern);
        candidates = events
          .filter(
            (e) =>
              pattern.test(normalize(e.name + ' ' + (e.category || ''))) &&
              (c.id !== 'III' ||
                !(
                  /docent|professor/.test(normalize(e.name)) ||
                  String(e.id).startsWith('teacher-vacation')
                )),
          )
          .map((e) => ({
            id: e.id,
            name: e.name,
            start: e.start,
            end: e.end,
            evidence: e.evidence ?? '',
          }));
        signal = candidates.length
          ? `${candidates.length} registro(s) possivelmente relacionado(s). A presença não comprova atendimento.`
          : 'Nenhum registro localizado por nome/categoria. Isso não comprova ausência no processo.';
      }
      if (c.id === 'annual')
        signal = result
          ? countLabel +
            counts
              .map(([m, r]) => {
                const minimum =
                  record.state.year === 2026 && m !== 'posgraduacao'
                    ? legacyDayMinimums.annual
                    : r.checks.find((check) => check.scope === 'annual')?.expected;
                return `${modalityLabels[m] || m}: ${r.total} dias letivos registrados; ${minimum == null ? 'mínimo normativo não configurado para este escopo' : `${r.total >= minimum ? 'alcança' : 'não alcança'} a referência de ${minimum} dias`}`;
              })
              .join('; ') +
            '. Carga horária do PPC exige análise.' +
            (provisional ? ' ' + error : '')
          : (error ?? '');
      if (c.id === 'semester')
        signal =
          (record.state.regime === 'anual'
            ? 'Regime anual: confira a aplicabilidade do mínimo semestral. '
            : '') +
          (result
            ? countLabel +
              counts
                .map(
                  ([m, r]) =>
                    `${modalityLabels[m] || m}: ` +
                    periodsForModality(record.state, m)
                      .map((p) => `${p.name || p.id}: ${r.byPeriod[p.id]} dias letivos`)
                      .join('; '),
                )
                .join(' | ')
            : error);
      if (c.id === 'I')
        signal =
          record.state.periods.map((p) => `${p.name}: ${p.start} a ${p.end}`).join('; ') ||
          'Nenhum período cadastrado. Confira também as etapas internas.';
      if (c.id === 'window') {
        const starts = record.state.periods.map((p) => p.start).sort(),
          ends = record.state.periods.map((p) => p.end).sort();
        signal = !sameYear
          ? 'Datas da norma de referência não aplicadas. Consulte a resolução do ano do calendário.'
          : !normativeScopeConfirmed || !window
            ? 'Aplicabilidade da janela a conferir; identifique o escopo e a norma própria quando necessária.'
            : !starts.length
              ? 'Nenhum período cadastrado.'
              : `${starts[0]} a ${ends.at(-1)}. ${starts[0] >= windowStart && starts[0] <= latestStart && ends.at(-1)! <= windowEnd ? 'Dentro da janela indicada no parecer.' : 'Fora da janela indicada no parecer; revisar.'}`;
      }
      if (
        ['V', 'VII'].includes(c.id) &&
        calendarModalities(record.state).every((m) => m === 'integrado')
      )
        signal +=
          ' O texto do parecer menciona subsequentes e graduação: confira se não se aplica.';
      if (
        ['XXIV', 'XXV', 'XXVI'].includes(c.id) &&
        calendarModalities(record.state).every((m) => m === 'graduacao')
      )
        signal += ' A norma de referência considera esse evento facultativo para graduação.';
      if (['IV', 'XXII', 'XXIII'].includes(c.id))
        signal += ' A quantidade de dias/horas não está comprovada pela identificação do evento.';
      if (record.state.year === 2027) {
        const linked = coverage.filter((row) => row.requirement.reviewCriterionId === c.id);
        if (linked.length) {
          signal =
            linked
              .map(
                (row) =>
                  `${modalityLabels[row.modality]} — ${row.requirement.name}: ${row.applicability === 'required' ? 'obrigatório' : row.applicability === 'optional' ? 'opcional' : 'escopo a conferir'}; planejamento ${row.coverage === 'complete' ? 'completo' : row.coverage === 'partial' ? 'parcial' : 'pendente'}; ${row.execution === 'published' ? 'execução comprovada' : row.execution === 'planned' ? 'publicação prevista' : 'execução a classificar'}. ${[...row.issues, ...row.warnings].join(' ')}`,
              )
              .join(' | ') +
            ' A presença não comprova atendimento. A conferência humana permanece necessária.';
          candidates = [
            ...new Map(
              [...candidates, ...linked.flatMap((row) => row.events)].map((e) => [
                e.id,
                { ...e, evidence: e.evidence ?? '' },
              ]),
            ).values(),
          ];
        }
      }
      let status = 'PENDENTE',
        finding = candidates.length ? 'REGISTROS_LOCALIZADOS' : 'CONFERENCIA_NECESSARIA';
      if (c.pattern && !candidates.length) finding = 'NAO_LOCALIZADO';
      if (c.id === 'annual' && result && !provisional) {
        finding = counts.some(([, r]) => r.total < dayMinimums.annual)
          ? 'CONTAGEM_INSUFICIENTE'
          : 'CONTAGEM_ALCANCADA';
        if (
          sameYear &&
          normativeScopeConfirmed &&
          counts.some(([, r]) => r.total < dayMinimums.annual)
        )
          status = 'NAO_ATENDIDO';
      }
      if (c.id === 'semester' && record.state.regime === 'anual') {
        finding = 'APLICABILIDADE';
        if (sameYear && normativeScopeConfirmed) status = 'NAO_APLICAVEL';
      }
      if (c.id === 'semester' && record.state.regime !== 'anual' && result && !provisional) {
        const valid =
          counts.length > 0 &&
          counts.every(
            ([m, r]) =>
              organizationForModality(record.state, m) !== 'semestral' ||
              (periodsForModality(record.state, m).length === 2 &&
                periodsForModality(record.state, m).every(
                  (p) => r.byPeriod[p.id] >= dayMinimums.semester,
                )),
          );
        finding = valid ? 'CONTAGEM_ALCANCADA' : 'CONTAGEM_INSUFICIENTE';
        if (sameYear && normativeScopeConfirmed) status = valid ? 'ATENDIDO' : 'NAO_ATENDIDO';
      }
      if (c.id === 'window' && sameYear && normativeScopeConfirmed && record.state.periods.length) {
        const starts = record.state.periods.map((p) => p.start).sort(),
          ends = record.state.periods.map((p) => p.end).sort();
        status =
          starts[0] >= windowStart && starts[0] <= latestStart && ends.at(-1)! <= windowEnd
            ? 'ATENDIDO'
            : 'NAO_ATENDIDO';
        finding = 'DATAS_COMPARADAS';
      }
      if (!normativeScopeConfirmed) {
        status = 'PENDENTE';
        signal =
          (signal.trim() ? signal.trim().replace(/[.!?]+$/, '') + '. ' : '') +
          'Escopo da norma a confirmar; EaD, qualificação e pós-graduação dependem de calendário próprio.';
      }
      return {
        ...c,
        signal,
        candidates,
        initial: { id: c.id, status, notes: '', reviewed: false, finding },
      };
    }),
    teachingDays: counts.map(([modality, r]) => ({
      modality,
      total: r.total,
      byPeriod: r.byPeriod,
      provisional,
    })),
    conflicts: result?.conflicts || [],
    countError: error,
  };
}

export const reviewStatuses = ['PENDENTE', 'ATENDIDO', 'NAO_ATENDIDO', 'NAO_APLICAVEL'];

export function initialConclusion(support: ReturnType<typeof reviewSupport>) {
  const missing = support.criteria.filter((c) => c.initial.finding === 'NAO_LOCALIZADO').length,
    norm = reviewNorm(support.calendar.year, support.sameYear ? support.source.norm : '');
  return `A análise inicial do Calendário Acadêmico e Administrativo ${support.calendar.year}, campus ${support.calendar.campus}, foi organizada conforme critérios institucionais${norm ? ', observada a ' + norm : ''}. Foram examinados ${support.criteria.length} critérios com os dados cadastrados. ${missing} critério(s) não tiveram registros localizados pela busca de nomes/categorias e necessitam conferência documental. ${support.countError || 'A contagem e os conflitos identificados estão registrados na análise técnica.'} Esta é uma minuta de apoio, sujeita à revisão e à conclusão do parecerista. Não constitui aprovação oficial.`;
}
