/** Calendar lifecycle, from draft to publication. Pure: no database, clock or identity. */
import { DomainError } from '../errors.ts';

export const calendarStatuses = [
  'rascunho',
  'enviado',
  'em_revisao',
  'devolvido',
  'revisado',
  'vigente',
  'arquivado',
] as const;
export type CalendarStatus = (typeof calendarStatuses)[number];

export const lifecycleActions = [
  'submit',
  'withdraw',
  'startReview',
  'return',
  'conclude',
  'reopen',
  'publish',
  'archive',
  'reinstate',
] as const;
export type LifecycleAction = (typeof lifecycleActions)[number];
export type LifecycleRole = 'ADMIN' | 'CAMPUS' | 'PARECERISTA';

/** Who acts: the campus edits its calendar, the reviewer analyses it, the administration publishes. */
type Actor = 'campus' | 'reviewer' | 'admin';
const transitions: Record<
  LifecycleAction,
  { from: readonly CalendarStatus[]; to: CalendarStatus | 'origin'; actor: Actor }
> = {
  submit: { from: ['rascunho', 'devolvido'], to: 'enviado', actor: 'campus' },
  withdraw: { from: ['enviado'], to: 'origin', actor: 'campus' },
  startReview: { from: ['enviado'], to: 'em_revisao', actor: 'reviewer' },
  return: { from: ['enviado', 'em_revisao', 'revisado'], to: 'devolvido', actor: 'reviewer' },
  conclude: { from: ['em_revisao'], to: 'revisado', actor: 'reviewer' },
  reopen: { from: ['revisado'], to: 'em_revisao', actor: 'reviewer' },
  publish: { from: ['revisado'], to: 'vigente', actor: 'admin' },
  archive: { from: ['vigente'], to: 'arquivado', actor: 'admin' },
  reinstate: { from: ['arquivado'], to: 'vigente', actor: 'admin' },
};

/** The administration may perform every action in the table, never a jump outside it. */
function allowed(actor: Actor, role: LifecycleRole) {
  if (role === 'ADMIN') return true;
  return actor === 'campus' ? role === 'CAMPUS' : actor === 'reviewer' && role === 'PARECERISTA';
}

export const statusLabels: Record<CalendarStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_revisao: 'Em revisão',
  devolvido: 'Devolvido',
  revisado: 'Revisado',
  vigente: 'Vigente',
  arquivado: 'Arquivado',
};

export const actionLabels: Record<LifecycleAction, string> = {
  submit: 'Enviar para análise',
  withdraw: 'Recolher envio',
  startReview: 'Iniciar revisão',
  return: 'Devolver ao campus',
  conclude: 'Concluir revisão',
  reopen: 'Reabrir revisão',
  publish: 'Publicar',
  archive: 'Arquivar',
  reinstate: 'Restabelecer',
};

/** Statuses whose content the campus still edits. */
export const editableStatuses: readonly CalendarStatus[] = ['rascunho', 'devolvido'];
/** Statuses between submission and publication: one per campus, year and offer kind. */
export const inFlowStatuses: readonly CalendarStatus[] = [
  'enviado',
  'em_revisao',
  'devolvido',
  'revisado',
];
/** Statuses with an open submission for the reviewer. */
export const underReviewStatuses: readonly CalendarStatus[] = ['enviado', 'em_revisao', 'revisado'];
/** Published statuses read only the institutional base frozen with the content. */
export const publishedStatuses: readonly CalendarStatus[] = ['vigente', 'arquivado'];

export const isEditable = (status: CalendarStatus) => editableStatuses.includes(status);
export const isPublished = (status: CalendarStatus) => publishedStatuses.includes(status);
export const isUnderReview = (status: CalendarStatus) => underReviewStatuses.includes(status);
/** Logical deletion is limited to drafts and returned calendars, even for the administration. */
export const isDeletable = (status: CalendarStatus) => isEditable(status);
/** Only a published calendar carries the official approval of its SEI process. */
export const officialApproval = (status: CalendarStatus) => status === 'vigente';

/**
 * Applies the transition table. `origin` is where an open submission came from, needed only to
 * withdraw it. Throws 409 for a transition outside the table and 400 for a role without access.
 */
export function transition(
  status: CalendarStatus,
  action: LifecycleAction,
  role: LifecycleRole,
  origin?: 'rascunho' | 'devolvido',
): CalendarStatus {
  const rule = transitions[action];
  if (!rule.from.includes(status))
    throw new DomainError(
      `${actionLabels[action]} não se aplica a um calendário ${statusLabels[status].toLowerCase()}.`,
      409,
    );
  if (!allowed(rule.actor, role))
    throw new DomainError(`${actionLabels[action]}: ação não permitida para este perfil.`);
  if (rule.to !== 'origin') return rule.to;
  if (!origin) throw new DomainError('O envio não registra o estado de origem.', 409);
  return origin;
}

/** Whether `role` may run `action` from `status`, for the interface to offer it. */
export function canTransition(
  status: CalendarStatus,
  action: LifecycleAction,
  role: LifecycleRole,
) {
  const rule = transitions[action];
  return rule.from.includes(status) && allowed(rule.actor, role);
}

/** A new version copies a published calendar into a new draft for the campus. */
export function canCreateVersion(status: CalendarStatus, role: LifecycleRole) {
  return status === 'vigente' && role !== 'PARECERISTA';
}

/** The print mark depends only on the status, never on readiness. */
export function printMark(
  status: CalendarStatus,
  publication: { seiProcess?: string; supersededByName?: string } = {},
) {
  switch (status) {
    case 'rascunho':
      return 'Rascunho — sem validade';
    case 'enviado':
    case 'em_revisao':
      return 'Cópia para análise da PROENS';
    case 'devolvido':
      return 'Em ajuste — sem validade';
    case 'revisado':
      return 'Revisado — aguardando publicação';
    case 'vigente':
      return `Processo SEI nº ${publication.seiProcess ?? '—'}`;
    case 'arquivado':
      return publication.supersededByName
        ? `Substituído por ${publication.supersededByName}`
        : 'Arquivado';
  }
}

/** Prefix of the suggested PDF file name. */
export function fileNamePrefix(status: CalendarStatus) {
  return status === 'vigente'
    ? ''
    : status === 'arquivado'
      ? 'arquivado-'
      : `${status.replace('_', '-')}-`;
}

export const seiPattern = /^\d{5}\.\d{6}\/\d{4}-\d{2}$/;
export function validSei(value: string) {
  const sei = value.trim();
  if (!seiPattern.test(sei))
    throw new DomainError('Informe o processo SEI no formato 00000.000000/0000-00.');
  return sei;
}

export const maximumLabelLength = 120;
export const maximumNoteLength = 4000;

/** Offer kinds two calendars share: the unit of uniqueness. */
export function sharedKinds<T extends string>(a: readonly T[], b: readonly T[]) {
  return a.filter((kind) => b.includes(kind));
}
