export type DocumentStatus = '' | 'rascunho' | 'vigente' | 'arquivado';

function documentStatus(value: unknown): Exclude<DocumentStatus, ''> | undefined {
  return value === 'rascunho' || value === 'vigente' || value === 'arquivado' ? value : undefined;
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
  const search = parameters.toString();
  return search ? '?' + search : '';
}

export function applicationSearch(input: Record<string, unknown>) {
  const year = Number(input.ano);
  const situation = documentStatus(input.situacao);
  return {
    ...(text(input.campus) ? { campus: text(input.campus) } : {}),
    ...(Number.isInteger(year) && year >= 1900 && year <= 9999 ? { ano: String(year) } : {}),
    ...(situation ? { situacao: situation } : {}),
    ...(text(input.busca) ? { busca: text(input.busca)?.slice(0, 200) } : {}),
    ...(text(input.retorno) ? { retorno: text(input.retorno) } : {}),
    ...(input.devtools === '1' ? { devtools: '1' } : {}),
    ...(input.aviso === 'acesso-negado' ? { aviso: 'acesso-negado' } : {}),
    ...(typeof input.atividadeBusca === 'string' && input.atividadeBusca.trim()
      ? { atividadeBusca: input.atividadeBusca.slice(0, 200) }
      : {}),
    ...(['integrado', 'subsequente', 'graduacao', 'posgraduacao'].includes(
      String(input.atividadeOferta),
    )
      ? { atividadeOferta: String(input.atividadeOferta) }
      : {}),
    ...(['all', 'pending', 'partial', 'complete', 'optional', 'unconfigured'].includes(
      String(input.atividadeSituacao),
    )
      ? { atividadeSituacao: String(input.atividadeSituacao) }
      : {}),
    ...(['admission', 'teaching', 'campus', 'other'].includes(String(input.atividadeAssunto))
      ? { atividadeAssunto: String(input.atividadeAssunto) }
      : {}),
    ...(input.aba === 'eventos' || input.aba === 'anterior'
      ? { aba: input.aba === 'eventos' ? ('eventos' as const) : ('anterior' as const) }
      : {}),
    ...(typeof input.atividade === 'string' && /^[a-z0-9:-]{1,100}$/.test(input.atividade)
      ? { atividade: input.atividade }
      : {}),
  };
}
