import { setTimeout as delay } from 'node:timers/promises';

export interface ReleaseStatus {
  emergency: boolean;
  paused: boolean;
  commit: string | null;
  active: Array<{ id: string; operation: string; startedAt: number }>;
}

export function parseReleaseStatus(value: string): ReleaseStatus {
  const status: unknown = JSON.parse(value);
  if (
    !status ||
    typeof status !== 'object' ||
    !('emergency' in status) ||
    typeof status.emergency !== 'boolean' ||
    !('paused' in status) ||
    typeof status.paused !== 'boolean' ||
    !('commit' in status) ||
    !(typeof status.commit === 'string' || status.commit === null) ||
    !('active' in status) ||
    !Array.isArray(status.active) ||
    !status.active.every(
      (item: unknown) =>
        item !== null &&
        typeof item === 'object' &&
        'id' in item &&
        typeof item.id === 'string' &&
        'operation' in item &&
        typeof item.operation === 'string' &&
        'startedAt' in item &&
        typeof item.startedAt === 'number',
    )
  )
    throw Error('O controle operacional não retornou um estado de drenagem válido.');
  return status as ReleaseStatus;
}

type Polling = {
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<unknown>;
  now?: () => number;
};

export interface MigrationProgress {
  name: string;
  state: 'inProgress' | 'success' | 'failed' | 'canceled' | 'unknown';
  processed: number;
  error: string | null;
}

// Migrations run in Convex batches; the release only waits and never rolls back.
export async function waitForMigrations(
  readStatus: () => MigrationProgress[],
  { timeoutMs = 20 * 60_000, sleep = delay, now = Date.now }: Polling = {},
) {
  const started = now();
  for (;;) {
    const statuses = readStatus();
    if (!Array.isArray(statuses)) throw Error('O status das migrações é inválido.');
    const inProgress = statuses.some(({ state }) => state === 'inProgress');
    const stopped = statuses.find(
      ({ state }) =>
        state === 'failed' || state === 'canceled' || (state === 'unknown' && !inProgress),
    );
    if (stopped)
      throw Error(
        `A migração ${stopped.name} terminou como ${stopped.state}${stopped.error ? `: ${stopped.error}` : ''}.`,
      );
    if (statuses.every(({ state }) => state === 'success')) return statuses;
    if (now() - started >= timeoutMs)
      throw Error('As migrações não terminaram no prazo; o progresso no Convex foi preservado.');
    await sleep(2000);
  }
}
