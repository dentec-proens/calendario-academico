const preserved = new Set([
  'access/cleanup:purgeRevoked',
  'access/cleanup:sweep',
  'nativeFiles:expireUpload',
  'nativeFiles:expireTicket',
  'nativeFiles:cleanupExpired',
]);

export function assertScheduledFunctions(value: unknown, authoritative = true) {
  if (!Array.isArray(value))
    throw Error('Não foi possível inventariar todas as funções agendadas.');
  for (const row of value) {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.name !== 'string' ||
      !row.state ||
      typeof row.state.kind !== 'string'
    )
      throw Error('Inventário de funções agendadas inválido.');
    if (authoritative && row.state.kind === 'inProgress')
      throw Error('Uma função agendada ainda está em execução.');
    if (row.state.kind === 'pending' && !preserved.has(row.name.replace(/\.js:/, ':')))
      throw Error(`A função agendada ${row.name} não possui identidade preservada nesta entrega.`);
  }
}

export function inspectScheduledFunctions(
  read: (cursor: string | null) => string,
  authoritative: boolean,
) {
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    const value: unknown = JSON.parse(read(cursor));
    if (
      !value ||
      typeof value !== 'object' ||
      !('page' in value) ||
      !('isDone' in value) ||
      typeof value.isDone !== 'boolean' ||
      !('continueCursor' in value) ||
      typeof value.continueCursor !== 'string'
    )
      throw Error('Página de inventário operacional inválida.');
    assertScheduledFunctions(value.page, authoritative);
    if (value.isDone) return;
    if (!value.continueCursor || seen.has(value.continueCursor))
      throw Error('O inventário operacional não avançou.');
    seen.add(value.continueCursor);
    cursor = value.continueCursor;
  }
}
