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

export async function waitForDrain(
  commit: string,
  readStatus: () => ReleaseStatus,
  { timeoutMs = 20 * 60_000, sleep = delay, now = Date.now }: Polling = {},
) {
  const started = now();
  for (;;) {
    const status = readStatus();
    if (!status.paused || status.commit !== commit)
      throw Error('A janela de manutenção não pertence ao commit conferido.');
    if (status.active.length === 0) return;
    if (now() - started >= timeoutMs)
      throw Error(
        'Não foi possível comprovar a conclusão das actions. A manutenção permanece ativa.',
      );
    await sleep(2000);
  }
}

interface VercelDeployment {
  uid?: string;
  id?: string;
  state?: string;
  readyState?: string;
  meta?: { githubCommitSha?: string };
}

export async function waitForFrontend(
  commit: string,
  target: { team: string; project: string; portalUrl: string },
  token: string,
  {
    timeoutMs = 20 * 60_000,
    sleep = delay,
    now = Date.now,
    fetcher = fetch,
  }: Polling & { fetcher?: typeof fetch } = {},
) {
  const started = now();
  async function read(path: string): Promise<unknown> {
    const response = await fetcher(`https://api.vercel.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw Error(`Não foi possível confirmar o deployment Vercel (${response.status}).`);
    return response.json();
  }
  const query = new URLSearchParams({
    slug: target.team,
    projectId: target.project,
    target: 'production',
    sha: commit,
    limit: '20',
  });
  for (;;) {
    const listing = (await read(`/v7/deployments?${query}`)) as {
      deployments?: VercelDeployment[];
    };
    if (!Array.isArray(listing.deployments)) throw Error('Resposta inválida da API Vercel.');
    const deployment = listing.deployments.find((item) => item.meta?.githubCommitSha === commit);
    const state = deployment?.readyState ?? deployment?.state;
    if (state === 'ERROR' || state === 'CANCELED')
      throw Error('O deployment Vercel falhou. A manutenção permanece ativa.');
    if (deployment && state === 'READY') {
      const deploymentId = deployment.id ?? deployment.uid;
      if (!deploymentId) throw Error('A Vercel não informou a identidade do deployment.');
      const host = new URL(target.portalUrl).hostname;
      const promoted = (await read(
        `/v13/deployments/${encodeURIComponent(host)}?${new URLSearchParams({ slug: target.team })}`,
      )) as VercelDeployment;
      if (
        promoted.meta?.githubCommitSha === commit &&
        (promoted.readyState ?? promoted.state) === 'READY' &&
        (promoted.id ?? promoted.uid) === deploymentId
      ) {
        const response = await fetcher(target.portalUrl, {
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html'))
          throw Error('O portal publicado não passou na conferência de acesso.');
        return;
      }
    }
    if (now() - started >= timeoutMs)
      throw Error(
        'A Vercel não confirmou o commit no domínio de produção. A manutenção permanece ativa.',
      );
    await sleep(5000);
  }
}
