import type { CalendarActivity, CalendarOffer } from '../calendar/model.ts';
export interface CatalogueEvent extends CalendarActivity {
  evidence: string;
  active: boolean;
  modalities: string[];
  category: string;
}

// User-supplied campus list, with Foz added by explicit request. Admin may extend it.
export const campusNames = [
  'Assis Chateaubriand',
  'Arapongas',
  'Astorga',
  'Barracão',
  'Campo Largo',
  'Capanema',
  'Cascavel',
  'Colombo',
  'Coronel Vivida',
  'Curitiba',
  'Foz do Iguaçu',
  'Goioerê',
  'Irati',
  'Ivaiporã',
  'Jacarezinho',
  'Jaguariaíva',
  'Londrina',
  'Palmas',
  'Paranaguá',
  'Paranavaí',
  'Pinhais',
  'Pitanga',
  'Quedas do Iguaçu',
  'Telêmaco Borba',
  'Umuarama',
  'União da Vitória',
];

export function initialCatalogue() {
  const source = 'Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm';
  const rows = [
    ['01-01', 'Confraternização Universal', source],
    ['04-21', 'Tiradentes', source],
    ['05-01', 'Dia do Trabalho', source],
    ['09-07', 'Independência do Brasil', source],
    [
      '10-12',
      'Nossa Senhora Aparecida',
      'Lei 6.802/1980: https://www.planalto.gov.br/ccivil_03/leis/l6802.htm',
    ],
    ['11-02', 'Finados', source],
    ['11-15', 'Proclamação da República', source],
    [
      '11-20',
      'Dia Nacional de Zumbi e da Consciência Negra',
      'Lei 14.759/2023: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm',
    ],
    ['12-25', 'Natal', source],
  ];
  const events: CatalogueEvent[] = rows.map(([date, name, evidence], i) => ({
    id: `national-${i}`,
    name,
    start: `2027-${date}`,
    end: `2027-${date}`,
    kind: 'exclude',
    category: 'feriado',
    evidence: evidence!,
    modalities: ['integrado', 'subsequente', 'graduacao'],
    active: true,
  }));
  const fixed = [
    ['ifpr2027-0', '02-08', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-1', '02-09', 'Carnaval — recesso acadêmico e administrativo', 'recesso'],
    [
      'ifpr2027-2',
      '02-10',
      'Quarta-feira de Cinzas — recesso acadêmico e administrativo',
      'recesso',
    ],
    [
      'ifpr2027-3',
      '03-26',
      'Paixão de Cristo — impedimento previsto no calendário IFPR',
      'feriado',
    ],
    ['ifpr2027-4', '04-14', 'Dia Nacional da Luta pela Educação Inclusiva', 'comemorativo'],
    ['ifpr2027-5', '05-27', 'Corpus Christi — recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-6', '05-28', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-7', '05-31', 'Prazo para informar cursos e vagas à PROENS', 'prazo'],
    ['ifpr2027-8', '06-05', 'Dia Mundial do Meio Ambiente', 'comemorativo'],
    ['ifpr2027-9', '06-09', 'Dia Nacional de Imunização', 'comemorativo'],
    ['ifpr2027-10', '06-15', 'Prazo de referência dos editais do Processo Seletivo 2028', 'prazo'],
    [
      'ifpr2027-11',
      '07-06',
      'Lei Brasileira de Inclusão da Pessoa com Deficiência',
      'comemorativo',
    ],
    ['ifpr2027-12', '08-06', 'Dia Nacional dos Profissionais da Educação', 'comemorativo'],
    ['ifpr2027-13', '08-11', 'Dia do Estudante', 'comemorativo'],
    ['ifpr2027-14', '09-06', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-15', '10-11', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-16', '10-15', 'Dia do Professor — feriado escolar', 'feriado'],
    [
      'ifpr2027-17',
      '10-28',
      'Dia do Servidor Público — recesso acadêmico e administrativo',
      'recesso',
    ],
    ['ifpr2027-18', '10-29', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-19', '11-01', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-20', '12-24', 'Recesso acadêmico e administrativo', 'recesso'],
    ['ifpr2027-21', '12-29', 'Criação do IFPR e da Rede Federal de EPT', 'criacao'],
    ['ifpr2027-22', '12-31', 'Recesso acadêmico e administrativo', 'recesso'],
  ];
  fixed.forEach(([id, date, name, category]) =>
    events.push({
      id,
      name,
      start: `2027-${date}`,
      end: `2027-${date}`,
      kind: ['recesso', 'feriado'].includes(category) ? 'exclude' : 'note',
      category,
      evidence:
        'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026 — SEI 4422750, arts. 2º e 3º',
      modalities: ['integrado', 'subsequente', 'graduacao'],
      active: true,
    }),
  );
  for (const [id, name, start, end] of [
    ['science', 'Mês Nacional da Ciência, Tecnologia e Inovações', '10-01', '10-31'],
    ['library', 'Semana Nacional do Livro e da Biblioteca', '10-23', '10-29'],
  ])
    events.push({
      id: `ifpr2027-${id}`,
      name,
      start: `2027-${start}`,
      end: `2027-${end}`,
      kind: 'note',
      category: 'comemorativo',
      evidence: 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026 — SEI 4422750, art. 2º',
      modalities: ['integrado', 'subsequente', 'graduacao'],
      active: true,
    });
  return { revision: 1, events };
}

/** Read-only rehearsal for an administrator. It never writes on server startup or replaces local dates. */
export function preview2027SourceUpdate(events: CatalogueEvent[]) {
  const canonical = initialCatalogue().events.filter((event) => event.id.startsWith('ifpr2027-'));
  const updates: { id: string; before: string; after: string }[] = [];
  const conflicts: { id: string; reason: string }[] = [];
  for (const next of canonical) {
    const previous = events.find((event) => event.id === next.id);
    if (!previous) {
      conflicts.push({
        id: next.id,
        reason: 'Evento ausente; conferir inclusão administrativa separadamente.',
      });
      continue;
    }
    if (
      previous.start !== next.start ||
      previous.end !== next.end ||
      previous.kind !== next.kind ||
      previous.name !== next.name ||
      previous.category !== next.category ||
      previous.active !== next.active ||
      [...previous.modalities].sort().join(',') !== [...next.modalities].sort().join(',')
    ) {
      conflicts.push({
        id: next.id,
        reason: 'Conteúdo local diferente da base inicial; nenhuma substituição proposta.',
      });
      continue;
    }
    if (previous.evidence === next.evidence) continue;
    if (!previous.evidence?.startsWith('Resolução IFPR 2027 — SEI 4354987,')) {
      conflicts.push({
        id: next.id,
        reason: 'Fonte local distinta; conferir antes de qualquer atualização.',
      });
      continue;
    }
    updates.push({ id: next.id, before: previous.evidence ?? '', after: next.evidence ?? '' });
  }
  return { year: 2027, updates, conflicts };
}

export function inheritedEvents<
  T extends {
    id: string;
    start: string;
    end: string;
    active: boolean;
    modalities?: string[];
  },
>(catalogue: { events: T[] }, year: number, offers: CalendarOffer[]) {
  const applies = (event: T, kind: string) =>
    !event.modalities?.length || event.modalities.includes(kind);
  return catalogue.events
    .filter(
      (e) =>
        e.active &&
        Number(e.start.slice(0, 4)) === year &&
        offers.some((offer) => applies(e, offer.kind)),
    )
    .map((e) => ({
      ...e,
      id: `inst:${e.id}`,
      institutional: true,
      offers: offers.filter((offer) => applies(e, offer.kind)).map((offer) => offer.id),
    }));
}
