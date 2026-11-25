// What GitHub says of a repo under the owner's credential (PS-08): read against a fake fetch, never the network.
import { describe, expect, it } from 'vitest';

import { FAKE_TOKEN } from '../__fixtures__/credential.ts';
import { GITHUB_API, repoAccessOf } from './github.ts';
import type { Fetch } from '../io.ts';
import type { ForgeRepo } from './remote.ts';

const REPO: ForgeRepo = { forge: 'github', host: 'github.com', owner: 'owner', name: 'repo.js' };

interface Asked {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly signal: boolean;
}

/** A fetch that answers `status` with `body` and keeps what it was asked. */
function fakeFetch(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  const asked: Asked[] = [];
  const fetch: Fetch = (input, init) => {
    asked.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: init?.headers as Record<string, string>,
      signal: init?.signal instanceof AbortSignal,
    });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
  };
  return { fetch, asked };
}

describe('repoAccessOf', () => {
  it('asks GET /repos/{owner}/{repo} with the token in Authorization, under a time limit', async () => {
    const { fetch, asked } = fakeFetch(200, { permissions: { push: true } });
    expect(await repoAccessOf(fetch, REPO, FAKE_TOKEN)).toEqual({ kind: 'push' });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toBe(`${GITHUB_API}/repos/owner/repo.js`);
    expect(asked[0]?.headers.Authorization === `Bearer ${FAKE_TOKEN}`).toBe(true);
    expect(asked[0]?.headers['User-Agent']).toBe('elvaria');
    expect(asked[0]?.signal).toBe(true);
  });

  it.each([
    [{ permissions: { push: false, pull: true } }, 'read_only'],
    [{ permissions: {} }, 'read_only'],
    [{ permissions: null }, 'read_only'],
    [{}, 'read_only'],
    [null, 'read_only'],
  ])('reads %j as %s', async (body, kind) => {
    expect(await repoAccessOf(fakeFetch(200, body).fetch, REPO, FAKE_TOKEN)).toEqual({ kind });
  });

  it.each([
    [401, { kind: 'refused', status: 401 }],
    [403, { kind: 'refused', status: 403 }],
    [404, { kind: 'not_found' }],
    [502, { kind: 'unreachable', detail: 'HTTP 502' }],
  ])('reads HTTP %i', async (status, access) => {
    expect(await repoAccessOf(fakeFetch(status).fetch, REPO, FAKE_TOKEN)).toEqual(access);
  });

  it('takes a 403 at the rate limit for a forge out of reach, not a refusal', async () => {
    const { fetch } = fakeFetch(403, {}, { 'x-ratelimit-remaining': '0' });
    expect(await repoAccessOf(fetch, REPO, FAKE_TOKEN)).toEqual({
      kind: 'unreachable',
      detail: 'rate limited',
    });
  });

  it('says a network failure without throwing', async () => {
    const offline: Fetch = () => Promise.reject(new TypeError('fetch failed'));
    expect(await repoAccessOf(offline, REPO, FAKE_TOKEN)).toEqual({
      kind: 'unreachable',
      detail: 'fetch failed',
    });
  });

  it('stops waiting at its limit', async () => {
    const silent: Fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('The operation was aborted due to timeout'));
        });
      });
    const access = await repoAccessOf(silent, REPO, FAKE_TOKEN, 20);
    expect(access).toEqual({ kind: 'unreachable', detail: 'The operation was aborted due to timeout' });
  });
});
