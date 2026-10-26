import { expect, test } from 'vitest';
import { productionCandidates } from '../scripts/release-candidate';

const commit = 'a'.repeat(40);
const previous = { id: 'dpl_old', url: 'https://old.vercel.app', commit: 'b'.repeat(40) };
const tested = { id: 'dpl_tested', url: 'https://tested.vercel.app', commit };
const projectId = 'prj_AlAdqLCrChRgLBS1wRnjif72pF01';
function scenario(
  status: number,
  { confirm = true, emptyRead = false, emptyCreate = false, rejected = false } = {},
) {
  let accepted = false,
    manual = true,
    elapsed = 0,
    polls = 0,
    promotions = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    expect(url.origin).toBe('https://api.vercel.com');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-token');
    if (url.pathname.startsWith('/v10/projects/')) {
      promotions++;
      accepted = true;
      manual = false;
      return new Response(null, { status: rejected ? 403 : status });
    }
    if (url.pathname === `/v9/projects/${projectId}`) {
      if (init?.method === 'PATCH') {
        if (typeof init.body !== 'string') throw Error('Expected JSON request');
        manual = false === JSON.parse(init.body).autoAssignCustomDomains;
      }
      return Response.json({
        id: projectId,
        accountId: 'team_IEsOK7eMdDWvSxzHFg3re3ZT',
        name: 'calendario-academico',
        autoAssignCustomDomains: !manual,
        link: {
          type: 'github',
          org: 'dentec-proens',
          repo: 'calendario-academico',
          productionBranch: 'main',
        },
      });
    }
    if (emptyCreate && url.pathname === '/v13/deployments' && init?.method === 'POST')
      return new Response(null, { status: 202 });
    if (emptyRead && url.pathname === '/v13/deployments/dpl_tested')
      return new Response(null, { status: 200 });
    const aliased = url.pathname.endsWith('calendario-academico-phi.vercel.app');
    if (accepted && aliased) polls++;
    const value = aliased && !(accepted && confirm && polls >= 3) ? previous : tested;
    return Response.json({
      ...value,
      url: new URL(value.url).hostname,
      projectId,
      target: 'production',
      readyState: 'READY',
      meta: { githubCommitSha: value.commit },
    });
  };
  const api = productionCandidates('synthetic-token', {
    fetcher,
    now: () => elapsed,
    sleep: async () => {
      elapsed += 10;
    },
    timeoutMs: 50,
  });
  return { api, state: () => ({ polls, promotions, manual }) };
}
test.each([200, 201, 202, 204])(
  'empty promotion acknowledgement %s still waits for the tested deployment on the alias',
  async (status) => {
    const { api, state } = scenario(status);
    await api.promote(tested, previous);
    expect(state()).toEqual({ polls: 3, promotions: 1, manual: true });
  },
);
test('an accepted promotion without alias confirmation times out and preserves manual domains', async () => {
  const { api, state } = scenario(202, { confirm: false });
  await expect(api.promote(tested, previous)).rejects.toThrow(/Promoção sem confirmação/);
  expect(state().promotions).toBe(1);
  expect(state().manual).toBe(true);
});
test('empty reads are rejected before promoting; acknowledgement handling does not weaken JSON reads', async () => {
  const { api, state } = scenario(202, { emptyRead: true });
  await expect(api.promote(tested, previous)).rejects.toThrow();
  expect(state().promotions).toBe(0);
});
test('rejected promotion is never treated as an acknowledgement', async () => {
  const { api, state } = scenario(202, { rejected: true });
  await expect(api.promote(tested, previous)).rejects.toThrow(/403/);
  expect(state().promotions).toBe(1);
  expect(state().manual).toBe(true);
});

test('creation without a deployment identity is rejected even with an accepted HTTP status', async () => {
  const { api, state } = scenario(202, { emptyCreate: true });
  await expect(api.stage(commit)).rejects.toThrow();
  expect(state().promotions).toBe(0);
});
