import { calendarLimits } from '#src/domain/calendar/config.ts';
import { activityFromKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { calendarStatuses } from '#src/domain/calendar/lifecycle.ts';
export type DocumentStatus = '' | 'rascunho' | 'vigente' | 'arquivado';

/** Each screen narrows `situacao` to the situations it lists. */
function situationFilter(value: unknown) {
  return calendarStatuses.find((status) => status === value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function parseApplicationSearch(search: string): Record<string, unknown> {
  const parameters = new URLSearchParams(search);
  const values: Record<string, unknown> = {};
  for (const key of new Set(parameters.keys())) {
    const entries = parameters.getAll(key);
    if (entries.length === 1) values[key] = entries[0];
  }
  return values;
}

export function stringifyApplicationSearch(values: Record<string, unknown>) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (
      (typeof value === 'string' && value) ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      parameters.set(key, String(value));
  }
  // Colons are valid in a query (RFC 3986) and keep activity keys readable (`final:cycle:first`).
  const search = parameters.toString().replaceAll('%3A', ':');
  return search ? '?' + search : '';
}

export function applicationSearch(input: Record<string, unknown>) {
  const year = Number(input.ano);
  const situation = situationFilter(input.situacao);
  return {
    ...(text(input.campus) ? { campus: text(input.campus) } : {}),
    ...(Number.isInteger(year) &&
    year >= calendarLimits.minimumYear &&
    year <= calendarLimits.maximumYear
      ? { ano: String(year) }
      : {}),
    ...(situation ? { situacao: situation } : {}),
    ...(input.responsavel === 'meus' || input.responsavel === 'livres'
      ? { responsavel: input.responsavel as 'meus' | 'livres' }
      : {}),
    ...(text(input.busca) ? { busca: text(input.busca)?.slice(0, 200) } : {}),
    ...(input.perfil === 'ADMIN' || input.perfil === 'CAMPUS' || input.perfil === 'PARECERISTA'
      ? { perfil: input.perfil as 'ADMIN' | 'CAMPUS' | 'PARECERISTA' }
      : {}),
    ...(text(input.retorno) ? { retorno: text(input.retorno) } : {}),
    // Calendar whose dates the copy screen lists; checked against the ones the person can read.
    ...(text(input.origem) ? { origem: text(input.origem)?.slice(0, 200) } : {}),
    ...(input.devtools === '1' ? { devtools: '1' } : {}),
    ...(input.aviso === 'acesso-negado' ? { aviso: 'acesso-negado' } : {}),
    // Operations log: the tab the administration reads; absent means the operations.
    ...(input.aba === 'feedback' || input.aba === 'falhas'
      ? { aba: input.aba as 'feedback' | 'falhas' }
      : {}),
    ...(typeof input.atividadeBusca === 'string' && input.atividadeBusca.trim()
      ? { atividadeBusca: input.atividadeBusca.slice(0, 200) }
      : {}),
    ...(typeof input.atividadeOferta === 'string' &&
    /^[a-z][a-z0-9-]{0,99}$/.test(input.atividadeOferta)
      ? { atividadeOferta: String(input.atividadeOferta) }
      : {}),
    // Activities step: the view (by activity, the default, or by date) and its filters.
    ...(input.atividadeVisao === 'data' ? { atividadeVisao: 'data' as const } : {}),
    ...(['preencher', 'sem-pendencias'].includes(String(input.atividadePendencia))
      ? {
          atividadePendencia: String(input.atividadePendencia) as 'preencher' | 'sem-pendencias',
        }
      : {}),
    ...(['vinculadas', 'campus', 'base'].includes(String(input.atividadeOrigem))
      ? { atividadeOrigem: String(input.atividadeOrigem) as 'vinculadas' | 'campus' | 'base' }
      : {}),
    // Visibility only filters date lines; absent means every date.
    ...(['oficiais', 'internas'].includes(String(input.atividadeVisibilidade))
      ? {
          atividadeVisibilidade: String(input.atividadeVisibilidade) as 'oficiais' | 'internas',
        }
      : {}),
    // The former "all" situation is the default view now and is dropped like an unknown value.
    ...(['pending', 'partial', 'complete', 'optional', 'unconfigured'].includes(
      String(input.atividadeSituacao),
    )
      ? { atividadeSituacao: String(input.atividadeSituacao) }
      : {}),
    ...(['admission', 'teaching', 'campus', 'other'].includes(String(input.atividadeAssunto))
      ? { atividadeAssunto: String(input.atividadeAssunto) }
      : {}),
    ...activityLink(input.atividade),
    // Calendar preview: the printed version; absent means the official one.
    ...(input.impressao === 'completa' ? { impressao: 'completa' as const } : {}),
  };
}

/**
 * The activity a review link names: a complete key of `activityKey()`, validated here. Any other
 * value, as a format 4 identifier (`final-1`) from an older link, is dropped and leaves only
 * `atividadeInvalida`, a flag the step shows as a warning; it is a boolean, so
 * `stringifyApplicationSearch` never writes it back to the URL.
 */
function activityLink(value: unknown): { atividade?: string; atividadeInvalida?: true } {
  if (typeof value !== 'string' || !value) return {};
  return value.length <= 200 && activityFromKey(value)
    ? { atividade: value }
    : { atividadeInvalida: true };
}
