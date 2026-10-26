import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseReleaseStatus, waitForDrain, waitForFrontend } from '../scripts/release-coordination';

const commit = 'a'.repeat(40);
const requestUrl = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

test('draining fails closed on incomplete evidence and does not expire accepted actions', async () => {
  assert.throws(() => parseReleaseStatus('{"paused":true,"commit":null}'), /válido/);
  let time = 0;
  let polls = 0;
  await assert.rejects(
    waitForDrain(
      commit,
      () => {
        polls++;
        return {
          emergency: false,
          paused: true,
          commit,
          active: [{ id: 'lease', operation: 'pdf', startedAt: 0 }],
        };
      },
      {
        timeoutMs: 10,
        now: () => time,
        sleep: async () => {
          time += 10;
        },
      },
    ),
    /conclusão das actions/,
  );
  assert.equal(polls, 2);
  await assert.rejects(
    waitForDrain(commit, () => ({ emergency: false, paused: false, commit, active: [] })),
    /não pertence/,
  );
});

test('a ready build cannot release maintenance until the production domain serves the same deployment', async () => {
  let time = 0;
  const fetcher: typeof fetch = async (url) => {
    const deployment = { id: 'new', state: 'READY', meta: { githubCommitSha: commit } };
    return Response.json(
      requestUrl(url).includes('/v7/')
        ? { deployments: [deployment] }
        : { ...deployment, id: 'old', meta: { githubCommitSha: 'b'.repeat(40) } },
    );
  };
  await assert.rejects(
    waitForFrontend(
      commit,
      { team: 'team', project: 'project', portalUrl: 'https://portal.example' },
      'private-token',
      {
        fetcher,
        timeoutMs: 10,
        now: () => time,
        sleep: async () => {
          time += 10;
        },
      },
    ),
    /domínio de produção/,
  );
});

test('frontend verification scopes the commit and sends the token only to the Vercel API', async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      url: requestUrl(url),
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    if (requestUrl(url).startsWith('https://api.vercel.com/')) {
      const deployment = { id: 'current', state: 'READY', meta: { githubCommitSha: commit } };
      return Response.json(
        requestUrl(url).includes('/v7/') ? { deployments: [deployment] } : deployment,
      );
    }
    return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
  };
  await waitForFrontend(
    commit,
    { team: 'team', project: 'project', portalUrl: 'https://portal.example' },
    'private-token',
    { fetcher },
  );
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0].url).searchParams.get('sha'), commit);
  assert.equal(new URL(calls[0].url).searchParams.get('slug'), 'team');
  assert.deepEqual(
    calls.map((call) => call.authorization),
    ['Bearer private-token', 'Bearer private-token', null],
  );
});
