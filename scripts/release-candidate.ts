import { setTimeout as delay } from 'node:timers/promises';
import { environments } from '../config/environments.ts';

export interface Candidate {
  id: string;
  url: string;
  commit: string;
}
type Deployment = {
  id: string;
  url: string;
  projectId: string;
  target: string;
  readyState: string;
  meta?: { githubCommitSha?: string };
};
const projectId = 'prj_AlAdqLCrChRgLBS1wRnjif72pF01';
const teamId = 'team_IEsOK7eMdDWvSxzHFg3re3ZT';

// All platform credentials stay inside this adapter. Callers receive only a
// deployment identity and its immutable URL, never a mutable alias.
export function productionCandidates(
  token: string,
  {
    fetcher = fetch,
    sleep = delay,
    now = Date.now,
    timeoutMs = 20 * 60_000,
  }: {
    fetcher?: typeof fetch;
    sleep?: (ms: number) => Promise<unknown>;
    now?: () => number;
    timeoutMs?: number;
  } = {},
) {
  async function send(path: string, method = 'GET', body?: unknown): Promise<Response> {
    const response = await fetcher(
      `https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${teamId}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw Error(`A Vercel recusou ${method} ${path} (${response.status}).`);
    return response;
  }
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    return (await (await send(path, method, body)).json()) as T;
  }
  async function project() {
    const value = await request<{
      id: string;
      accountId: string;
      name: string;
      autoAssignCustomDomains?: boolean;
      link?: { type: string; org: string; repo: string; productionBranch: string };
    }>(`/v9/projects/${projectId}`);
    if (
      value.id !== projectId ||
      value.accountId !== teamId ||
      value.name !== environments.vercel.project ||
      value.link?.type !== 'github' ||
      `${value.link.org}/${value.link.repo}` !== environments.git.repository ||
      value.link.productionBranch !== environments.git.branch
    )
      throw Error('O projeto Vercel não corresponde ao destino de produção versionado.');
    return value;
  }
  async function keepDomainsManual() {
    await project();
    await request(`/v9/projects/${projectId}`, 'PATCH', { autoAssignCustomDomains: false });
    if ((await project()).autoAssignCustomDomains !== false)
      throw Error('A atribuição automática de domínios continua ativa. Publicação bloqueada.');
  }
  async function current(): Promise<Candidate> {
    const host = new URL(environments.production.portalUrl).hostname;
    const value = await request<Deployment>(`/v13/deployments/${host}`);
    return candidate(value);
  }
  function candidate(value: Deployment): Candidate {
    if (
      !value.id?.startsWith('dpl_') ||
      value.projectId !== projectId ||
      value.target !== 'production' ||
      value.readyState !== 'READY' ||
      !/^[a-f0-9]{40}$/.test(value.meta?.githubCommitSha ?? '') ||
      !/^[a-z0-9-]+\.vercel\.app$/.test(value.url)
    )
      throw Error('O deployment não comprova projeto, ambiente, commit e estado READY.');
    return { id: value.id, url: `https://${value.url}`, commit: value.meta!.githubCommitSha! };
  }
  async function stage(commit: string): Promise<Candidate> {
    if ((await project()).autoAssignCustomDomains !== false)
      throw Error('Configure os domínios manuais antes de criar o candidato.');
    const [org, repo] = environments.git.repository.split('/');
    const created = await request<{ id: string }>('/v13/deployments', 'POST', {
      name: environments.vercel.project,
      project: projectId,
      target: 'production',
      gitSource: { type: 'github', org, repo, ref: commit, sha: commit },
    });
    if (!created.id?.startsWith('dpl_')) throw Error('A criação não retornou um deployment.');
    const started = now();
    for (;;) {
      const value = await request<Deployment>(`/v13/deployments/${created.id}`);
      if (value.readyState === 'ERROR' || value.readyState === 'CANCELED')
        throw Error('O build candidato falhou; o domínio público permanece na versão anterior.');
      if (value.readyState === 'READY') {
        const result = candidate(value);
        if (result.id !== created.id || result.commit !== commit)
          throw Error('O candidato não corresponde ao commit conferido.');
        return result;
      }
      if (now() - started >= timeoutMs) throw Error('Tempo esgotado aguardando o candidato.');
      await sleep(5000);
    }
  }
  async function assertCurrent(expected: Candidate) {
    if ((await current()).id !== expected.id)
      throw Error('O domínio público mudou durante a release. Confira a publicação concorrente.');
  }
  async function promote(tested: Candidate, previous: Candidate) {
    await assertCurrent(previous);
    const reread = candidate(await request<Deployment>(`/v13/deployments/${tested.id}`));
    if (reread.commit !== tested.commit || reread.url !== tested.url)
      throw Error('A identidade do candidato mudou depois da validação.');
    try {
      // Promotion may acknowledge with 202/204 and no JSON. The alias,
      // rather than the response body, proves that the tested build is public.
      await send(`/v10/projects/${projectId}/promote/${tested.id}`, 'POST', {});
      const started = now();
      while ((await current()).id !== tested.id) {
        if (now() - started >= timeoutMs)
          throw Error('Promoção sem confirmação. Consulte o domínio antes de repetir.');
        await sleep(3000);
      }
    } finally {
      // Promotion can change this project setting. Git auto-deploy is also
      // disabled in vercel.json; do not allow a later push to bypass promotion.
      await keepDomainsManual();
    }
  }
  async function deployment(id: string) {
    if (!/^dpl_[a-zA-Z0-9]+$/.test(id)) throw Error('Identidade de deployment inválida.');
    return candidate(await request<Deployment>(`/v13/deployments/${id}`));
  }
  return { current, keepDomainsManual, stage, assertCurrent, promote, deployment };
}
