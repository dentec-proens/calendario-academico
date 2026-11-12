/**
 * Closed registry of the calendar checks. Every finding names the check that produced it, and its
 * key is built from the check and the subject only: rewording a sentence never changes a key, so
 * comparisons between versions and submissions do not report a rewording as a new finding.
 */
export const checks = {
  identity: 'Cursos que o calendário atende',
  scope: 'Norma aplicável a cada oferta',
  'observance-orphan': 'Escolha de efeméride sem a data institucional na base',
  'observance-base': 'Referência institucional fora das datas permitidas da efeméride',
  'observance-choice': 'Escolha de efeméride fora das datas permitidas',
  stages: 'Quantidade de etapas de avaliação',
  'coverage-pending': 'Atividade exigida sem datas',
  'link-review': 'Data sob “Vínculo a conferir”',
  'link-review-row': 'Data sob “Vínculo a conferir”, vista na linha de cada oferta',
  'link-not-generated': 'Data cuja atividade não alcança a oferta',
  'activity-record': 'Data de atividade com registro inválido',
  'admission-classification': 'Classificação de ingresso do edital',
  'admission-purpose': 'Finalidade de ingresso do edital',
  'admission-destination': 'Período de destino do edital de transferência',
  'admission-before-period': 'Edital de transferência antes do período de destino',
  'deadline-extended': 'Prazo prorrogado por feriado municipal ou recesso',
  'deadline-late': 'Data posterior ao prazo',
  'deadline-adjusted': 'Prazo ajustado informado pelo campus',
  month: 'Mês exigido',
  'min-hours': 'Carga horária mínima',
  'exact-days': 'Total exato de dias',
  'review-instruction': 'Instrução para a revisão',
  'applicability-unconfigured': 'Aplicação a confirmar',
  'stage-cycle': 'Etapa fora do ciclo da oferta',
  'stage-results': 'Resultados antes do término da etapa',
  'stage-council': 'Conselho antes dos resultados',
  'stage-meeting': 'Reunião pedagógica antes dos resultados',
  'school-day': 'Data que não constitui dia letivo',
  vacation: 'Férias a corrigir',
  'notice-destination': 'Destino do edital',
  window: 'Ano letivo fora da referência',
  'periods-missing': 'Períodos letivos',
  'period-count': 'Períodos letivos da oferta',
  'teaching-days': 'Mínimo de dias letivos',
  conflicts: 'Conflitos na contagem',
  'count-unavailable': 'Contagem de dias indisponível',
} as const satisfies Record<string, string>;

export type CheckId = keyof typeof checks;

/** One finding of an activity × offer row, before readiness turns it into a content issue. */
export interface RowFinding {
  check: CheckId;
  detail: string;
  /** The date the finding is about, when it is about one. */
  eventId?: string;
}

/** Identifiers that name the subject of a finding; `undefined` parts are left out. */
export type FindingSubject = (string | number | undefined)[];

/** Stable key of a finding: the check and the parts that name its subject, never its text. */
export const findingKey = (check: CheckId, ...subject: FindingSubject) =>
  [check, ...subject.filter((part) => part !== undefined)].join(':');
