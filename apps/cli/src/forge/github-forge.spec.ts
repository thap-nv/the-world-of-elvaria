// The GitHub adapter of the Steward's forge port (PS-08c, ADR 0023) against a fake GitHub, never the network: each
// port call, how a refusal of the credential differs from the forge's own trouble, and that no detail it gives back
// holds the token. The token is only ever compared, never printed by an assertion. A pull request's status is in
// github-status.spec.ts.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { err } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, gitRepo, isolatedPath, tempDir, testIo } from '../__fixtures__/cli.ts';
import { FAKE_TOKEN, GITHUB_REMOTE, useFakeHelper } from '../__fixtures__/credential.ts';
import { BRANCH, HEAD, REPO, at, fakeGithub, forgeOver } from '../__fixtures__/github.ts';
import { gitToken, githubForge } from './github-forge.ts';
import type { TempDir } from '../__fixtures__/cli.ts';
import type { HelperAnswer } from '../__fixtures__/credential.ts';

const PULL = (number: number, state: string) => ({
  number,
  state,
  html_url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${number}`,
});
const DRAFT = { head: BRANCH, base: 'main', title: 'Thêm script pnpm check', body: 'The delivery note.' };

/** A problem of a forge that answered with an error: its reason, its detail and the HTTP status (RC-04). */
const failed = (reason: 'forge_auth' | 'forge_error', detail: string, status: number) =>
  err({ reason, detail, status });

describe('githubForge.repoOf', () => {
  const { forge } = forgeOver({}, FAKE_TOKEN);

  it("reads the owner and the repo of a github.com remote, and keeps the territory's folder", () => {
    expect(forge.repoOf(GITHUB_REMOTE, 'C:/lãnh thổ')).toEqual({
      owner: 'elvaria-specs',
      name: 'kingdom-repo',
      cwd: 'C:/lãnh thổ',
    });
    expect(forge.repoOf('https://gitlab.com/elvaria-specs/kingdom-repo.git', 'C:/x')).toBeUndefined();
  });
});

describe('githubForge.access', () => {
  const access = (reply: Parameters<typeof forgeOver>[0][string]) =>
    forgeOver({ [`GET ${at()}`]: reply }, FAKE_TOKEN).forge.access(REPO);

  it('says push or read_only from the permissions GitHub gives the account', async () => {
    expect(await access({ status: 200, body: { permissions: { push: true } } })).toEqual({
      ok: true,
      value: 'push',
    });
    expect(await access({ status: 200, body: { permissions: { push: false } } })).toEqual({
      ok: true,
      value: 'read_only',
    });
  });

  it('takes 401 for the credential, 404, a rate limit or a server error for the forge', async () => {
    expect(await access({ status: 401 })).toEqual(err({ reason: 'forge_auth', detail: 'HTTP 401' }));
    expect(await access({ status: 404 })).toEqual(err({ reason: 'forge_error', detail: 'HTTP 404' }));
    expect(await access({ status: 403, headers: { 'x-ratelimit-remaining': '0' } })).toEqual(
      err({ reason: 'forge_error', detail: 'rate limited' }),
    );
    expect(await access({ status: 502 })).toEqual(err({ reason: 'forge_error', detail: 'HTTP 502' }));
  });
});

describe('githubForge.open', () => {
  const pulls = `GET ${at('pulls')}`;
  const create = `POST ${at('pulls')}`;

  it('finds the branch pull request in any state, an open one before a closed one, and opens none', async () => {
    const { forge, asked } = forgeOver(
      { [pulls]: { status: 200, body: [PULL(3, 'closed'), PULL(5, 'open')] } },
      FAKE_TOKEN,
    );
    expect(await forge.open(REPO, DRAFT)).toEqual({
      ok: true,
      value: { number: 5, url: PULL(5, 'open').html_url },
    });
    expect(asked.map(({ method }) => method)).toEqual(['GET']);
    expect(asked[0]?.url).toContain(`?head=elvaria-specs%3Aquest%2Fq_20261116_aaaaa1&state=all&per_page=100`);
    const closed = forgeOver({ [pulls]: { status: 200, body: [PULL(3, 'closed')] } }, FAKE_TOKEN);
    expect(await closed.forge.open(REPO, DRAFT)).toEqual({
      ok: true,
      value: { number: 3, url: PULL(3, 'closed').html_url },
    });
  });

  it('opens one when there is none, with the draft and the headers GitHub asks for', async () => {
    const { forge, asked } = forgeOver(
      { [pulls]: { status: 200, body: [] }, [create]: { status: 201, body: PULL(9, 'open') } },
      FAKE_TOKEN,
    );
    expect(await forge.open(REPO, DRAFT)).toEqual({
      ok: true,
      value: { number: 9, url: PULL(9, 'open').html_url },
    });
    const posted = asked.find(({ method }) => method === 'POST');
    expect(posted?.body).toEqual({ title: DRAFT.title, head: BRANCH, base: 'main', body: DRAFT.body });
    expect(posted?.headers.Authorization === `Bearer ${FAKE_TOKEN}`).toBe(true);
    expect(posted?.headers.Accept).toBe('application/vnd.github+json');
    expect(posted?.headers['User-Agent']).toBe('elvaria');
    expect(posted?.signal).toBe(true);
  });

  it('looks again after a 422 (one opened meanwhile), and says the 422 when it still finds none', async () => {
    const raced = forgeOver(
      {
        [pulls]: [
          { status: 200, body: [] },
          { status: 200, body: [PULL(11, 'open')] },
        ],
        [create]: { status: 422, body: { message: 'A pull request already exists' } },
      },
      FAKE_TOKEN,
    );
    expect(await raced.forge.open(REPO, DRAFT)).toEqual({
      ok: true,
      value: { number: 11, url: PULL(11, 'open').html_url },
    });
    const none = forgeOver(
      {
        [pulls]: { status: 200, body: [] },
        [create]: { status: 422, body: { message: 'Validation Failed' } },
      },
      FAKE_TOKEN,
    );
    expect(await none.forge.open(REPO, DRAFT)).toEqual(
      err({ reason: 'forge_error', detail: 'HTTP 422: Validation Failed' }),
    );
  });

  it('gives back what stopped the search, the opening, or the second search', async () => {
    const down = forgeOver({ [pulls]: { status: 500, body: 'Bad gateway' } }, FAKE_TOKEN);
    expect(await down.forge.open(REPO, DRAFT)).toEqual(failed('forge_error', 'HTTP 500', 500));
    const refused = forgeOver(
      {
        [pulls]: { status: 200, body: [] },
        [create]: { status: 403, body: { message: 'Resource not accessible' } },
      },
      FAKE_TOKEN,
    );
    expect(await refused.forge.open(REPO, DRAFT)).toEqual(
      failed('forge_auth', 'HTTP 403: Resource not accessible', 403),
    );
    const lost = forgeOver(
      {
        [pulls]: [{ status: 200, body: [] }, { status: 502 }],
        [create]: { status: 422, body: { message: 'Validation Failed' } },
      },
      FAKE_TOKEN,
    );
    expect(await lost.forge.open(REPO, DRAFT)).toEqual(failed('forge_error', 'HTTP 502', 502));
  });
});

describe('githubForge.merge', () => {
  const merge = (reply: { status: number; body?: unknown }) => {
    const over = forgeOver({ [`PUT ${at('pulls', '7', 'merge')}`]: reply }, FAKE_TOKEN);
    return { asked: over.asked, merged: over.forge.merge(REPO, 7, { method: 'squash', head: HEAD }) };
  };

  it('merges while the head is the one asked for, and gives the merge commit', async () => {
    const { asked, merged } = merge({ status: 200, body: { sha: 'b'.repeat(40), merged: true } });
    expect(await merged).toEqual({ ok: true, value: 'b'.repeat(40) });
    expect(asked[0]?.body).toEqual({ merge_method: 'squash', sha: HEAD });
  });

  it('reads 405 as a conflict, 409 as a moved head, 401 as the credential', async () => {
    expect(await merge({ status: 405, body: { message: 'Pull Request is not mergeable' } }).merged).toEqual(
      err({ reason: 'conflict', detail: 'Pull Request is not mergeable' }),
    );
    expect(await merge({ status: 409, body: { message: 'Head branch was modified' } }).merged).toEqual(
      err({ reason: 'head_moved', detail: 'Head branch was modified' }),
    );
    expect(await merge({ status: 401, body: { message: 'Bad credentials' } }).merged).toEqual(
      failed('forge_auth', 'HTTP 401: Bad credentials', 401),
    );
  });
});

describe('githubForge.deleteBranch', () => {
  const ref = `GET ${at('git', 'ref', 'heads', 'quest', 'q_20261116_aaaaa1')}`;
  const refs = `DELETE ${at('git', 'refs', 'heads', 'quest', 'q_20261116_aaaaa1')}`;

  it('deletes the branch while its tip is the head, through REST', async () => {
    const { forge, asked } = forgeOver(
      { [ref]: { status: 200, body: { object: { sha: HEAD } } }, [refs]: { status: 204 } },
      FAKE_TOKEN,
    );
    expect(await forge.deleteBranch(REPO, BRANCH, HEAD)).toEqual({ ok: true, value: true });
    expect(asked.map(({ method, path }) => `${method} ${path}`)).toEqual([ref, refs]);
  });

  it('leaves a branch that moved, and says false for one gone already', async () => {
    const moved = forgeOver(
      { [ref]: { status: 200, body: { object: { sha: 'c'.repeat(40) } } } },
      FAKE_TOKEN,
    );
    expect(await moved.forge.deleteBranch(REPO, BRANCH, HEAD)).toEqual({ ok: true, value: false });
    expect(moved.asked.map(({ method }) => method)).toEqual(['GET']);
    const gone = forgeOver({ [ref]: { status: 404, body: { message: 'Not Found' } } }, FAKE_TOKEN);
    expect(await gone.forge.deleteBranch(REPO, BRANCH, HEAD)).toEqual({ ok: true, value: false });
    const raced = forgeOver(
      { [ref]: { status: 200, body: { object: { sha: HEAD } } }, [refs]: { status: 422 } },
      FAKE_TOKEN,
    );
    expect(await raced.forge.deleteBranch(REPO, BRANCH, HEAD)).toEqual({ ok: true, value: false });
  });

  it('gives back a forge that could not answer either call', async () => {
    const down = forgeOver({ [ref]: { status: 503 } }, FAKE_TOKEN);
    expect(await down.forge.deleteBranch(REPO, BRANCH, HEAD)).toEqual(failed('forge_error', 'HTTP 503', 503));
    const refused = forgeOver(
      { [ref]: { status: 200, body: { object: { sha: HEAD } } }, [refs]: { status: 403 } },
      FAKE_TOKEN,
    );
    expect(await refused.forge.deleteBranch(REPO, BRANCH, HEAD)).toEqual(
      failed('forge_auth', 'HTTP 403', 403),
    );
  });
});

describe('githubForge: the credential and the secrets', () => {
  const pulls = `GET ${at('pulls')}`;

  it('says no_credential when git has none for github.com, and asks the forge nothing', async () => {
    const { fetch, asked } = fakeGithub({});
    const forge = githubForge({ fetch, token: () => Promise.resolve(err('none' as const)) });
    expect(await forge.access(REPO)).toEqual(
      err({ reason: 'no_credential', detail: 'git has no credential for github.com: none' }),
    );
    expect(asked).toEqual([]);
  });

  it('masks a token the forge echoes back, of a known shape or not', async () => {
    const echo = (token: string) =>
      forgeOver(
        { [pulls]: { status: 500, body: { message: `token ${token} is no good` } } },
        token,
      ).forge.open(REPO, DRAFT);
    for (const token of [FAKE_TOKEN, 'plain-value-the-spec-owns']) {
      const opened = await echo(token);
      const detail = opened.ok ? '' : (opened.error.detail ?? '');
      expect(detail.includes(token)).toBe(false);
      expect(detail).toBe('HTTP 500: token [redacted] is no good');
    }
  });

  it('masks the message of a network failure too', async () => {
    const token = 'plain-value-the-spec-owns';
    const { forge } = forgeOver({ [pulls]: new TypeError(`fetch failed for ${token}`) }, token);
    expect(await forge.open(REPO, DRAFT)).toEqual(
      err({ reason: 'forge_error', detail: 'fetch failed for [redacted]' }),
    );
  });

  it('takes a 403 at the rate limit for the forge, a plain 403 for the credential', async () => {
    const limited = forgeOver(
      {
        [pulls]: {
          status: 403,
          body: { message: 'API rate limit exceeded' },
          headers: { 'x-ratelimit-remaining': '0' },
        },
      },
      FAKE_TOKEN,
    );
    expect(await limited.forge.open(REPO, DRAFT)).toEqual(
      failed('forge_error', 'HTTP 403: API rate limit exceeded', 403),
    );
    const refused = forgeOver({ [pulls]: { status: 403, body: {} } }, FAKE_TOKEN);
    expect(await refused.forge.open(REPO, DRAFT)).toEqual(failed('forge_auth', 'HTTP 403', 403));
  });
});

describe('gitToken', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it("asks the owner's git store in the territory's folder, and says when it has none", async () => {
    const territory = await gitRepo(path.join(dir.root, 'lãnh thổ'));
    // A home of the spec's own, so the machine's ~/.gitconfig names no helper here: the fake one answers.
    const ioAnswering = async (answer: HelperAnswer) => {
      const home = path.join(dir.root, `home ${answer}`);
      await mkdir(home);
      await useFakeHelper(home, dir.root, answer);
      return testIo({ env: { ...baseEnv(await isolatedPath()), HOME: home, USERPROFILE: home } });
    };
    const token = await gitToken(await ioAnswering('token'))({ ...REPO, cwd: territory });
    expect(token.ok && token.value === FAKE_TOKEN).toBe(true);
    expect(await gitToken(await ioAnswering('nothing'))({ ...REPO, cwd: territory })).toEqual(err('none'));
  });
});
