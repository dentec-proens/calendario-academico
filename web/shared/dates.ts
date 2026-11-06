export function updatedLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Data não disponível';
}

/** How long ago something happened, in the unit a reviewer would use to prioritize it. */
export function elapsedLabel(value: string | null | undefined, now: number) {
  const since = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(since)) return null;
  const hours = Math.floor((now - since) / 3_600_000);
  if (hours < 1) return 'há menos de 1 hora';
  if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function waitingLabel(value: string | null | undefined, now: number) {
  const elapsed = elapsedLabel(value, now);
  return elapsed && `Aguardando ${elapsed}`;
}
