/**
 * Closed registry of the calendar checks. Every finding names the check that produced it, and its
 * key is built from the check and the subject only: rewording a sentence never changes a key, so
 * comparisons between versions and submissions do not report a rewording as a new finding.
 *
 * Each check declares who resolves what it finds, once; what a finding prevents comes from that
 * declaration alone (`blocks`), on the server and in the editor alike.
 */

/**
 * - `campus`: the campus corrects or declares it in the editor;
 * - `base`: the institutional base or the system is wrong; the campus asks the administration;
 * - `institution`: the DENTEC/PROENS judges it in the criterion of the finding, after the
 *   submission; the criterion keeps the publication waiting until the parecer assesses it;
 * - `none`: it only informs.
 */
export type Resolver = 'campus' | 'base' | 'institution' | 'none';

interface CheckSpec {
  label: string;
  resolver: Resolver;
}

export const checks = {
  identity: { label: 'Cursos que o calendário atende', resolver: 'campus' },
  scope: { label: 'Norma aplicável a cada oferta', resolver: 'campus' },
  'observance-orphan': {
    label: 'Escolha de efeméride sem a data institucional na base',
    resolver: 'campus',
  },
  'observance-base': {
    label: 'Referência institucional fora das datas permitidas da efeméride',
    resolver: 'base',
  },
  'observance-choice': {
    label: 'Escolha de efeméride fora das datas permitidas',
    resolver: 'campus',
  },
  stages: { label: 'Quantidade de etapas de avaliação', resolver: 'campus' },
  'coverage-pending': { label: 'Atividade exigida sem datas', resolver: 'campus' },
  'link-review': { label: 'Data sob “Vínculo a conferir”', resolver: 'campus' },
  // The date itself is reported once by `link-review`; the row only explains why it does not count.
  'link-review-row': {
    label: 'Data sob “Vínculo a conferir”, vista na linha de cada oferta',
    resolver: 'none',
  },
  'link-not-generated': { label: 'Data cuja atividade não alcança a oferta', resolver: 'none' },
  'activity-record': { label: 'Data de atividade com registro inválido', resolver: 'campus' },
  'admission-classification': { label: 'Classificação de ingresso do edital', resolver: 'campus' },
  'admission-purpose': { label: 'Finalidade de ingresso do edital', resolver: 'campus' },
  'admission-destination': {
    label: 'Período de destino do edital de transferência',
    resolver: 'campus',
  },
  'admission-before-period': {
    label: 'Edital de transferência antes do período de destino',
    resolver: 'campus',
  },
  'deadline-extended': {
    label: 'Prazo prorrogado por feriado municipal ou recesso',
    resolver: 'institution',
  },
  'deadline-late': { label: 'Data posterior ao prazo', resolver: 'campus' },
  'deadline-adjusted': { label: 'Prazo ajustado informado pelo campus', resolver: 'institution' },
  month: { label: 'Mês exigido', resolver: 'campus' },
  'min-hours': { label: 'Carga horária mínima', resolver: 'campus' },
  'exact-days': { label: 'Total exato de dias', resolver: 'campus' },
  'review-instruction': { label: 'Instrução para a revisão', resolver: 'institution' },
  'applicability-unconfigured': { label: 'Aplicação a confirmar', resolver: 'none' },
  'stage-cycle': { label: 'Etapa fora do ciclo da oferta', resolver: 'none' },
  'stage-results': { label: 'Resultados antes do término da etapa', resolver: 'none' },
  'stage-council': { label: 'Conselho antes dos resultados', resolver: 'none' },
  'school-day': { label: 'Data que não constitui dia letivo', resolver: 'campus' },
  vacation: { label: 'Férias a corrigir', resolver: 'campus' },
  // The activity row reports the same destination for the campus to fix (`admission-destination`);
  // this per-offer diagnosis explains it and never counts twice.
  'notice-destination': { label: 'Destino do edital', resolver: 'none' },
  window: { label: 'Ano letivo fora da referência', resolver: 'institution' },
  'week-unconfirmed': { label: 'Semana letiva', resolver: 'campus' },
  'periods-missing': { label: 'Períodos letivos', resolver: 'campus' },
  'period-count': { label: 'Períodos letivos da oferta', resolver: 'campus' },
  'teaching-days': { label: 'Mínimo de dias letivos', resolver: 'campus' },
  // No minimum to verify: a year without a configured norm, or an offer outside the norm.
  'teaching-days-unverifiable': { label: 'Mínimo de dias sem norma', resolver: 'none' },
  conflicts: { label: 'Conflitos na contagem', resolver: 'campus' },
  'inclusion-outside-periods': { label: 'Dias letivos fora dos períodos', resolver: 'campus' },
  'system-error': { label: 'Erro do sistema na conferência', resolver: 'base' },
} as const satisfies Record<string, CheckSpec>;

export type CheckId = keyof typeof checks;

/**
 * What a finding prevents, by who resolves it; the type keeps every resolver declared. The
 * institution judges in the criterion of the finding, and that criterion, not the finding, keeps
 * the publication waiting.
 */
const consequences: Record<Resolver, { submit: boolean; publish: boolean }> = {
  campus: { submit: true, publish: true },
  base: { submit: true, publish: true },
  institution: { submit: false, publish: false },
  none: { submit: false, publish: false },
};

/** What a finding of the check prevents. */
export const blocks = (check: CheckId) => consequences[checks[check].resolver];

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
