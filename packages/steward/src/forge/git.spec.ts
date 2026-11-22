// A delivery's git on a territory whose own config names programs for fsmonitor, ssh and the credential helper
// (SEC-02, threat model A5): a status and a push to a remote that asks for a credential (a local HTTP server
// answering 401) run none of them, and the push asks the owner's helper alone. git without gitGuard's switches, last,
// runs the territory's helper, so the case cannot pass on a poison that never worked.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { runToEnd } from '@elvaria/runner-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gitRepoWith } from '../__fixtures__/git-plots.ts';
import { poisonedGit, runsIn } from '../__fixtures__/poisoned-git.ts';
import { runDeliveryGit } from './git.ts';
import type { PoisonedGit } from '../__fixtures__/poisoned-git.ts';

const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;
/** A push to a local server: well within the limit on a busy machine. */
const LIMIT_MS = 60_000;

describe('runDeliveryGit on a poisoned territory', () => {
  let root: string;
  let repo: string;
  let poisoned: PoisonedGit;
  let server: Server;
  let remote: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'elvaria delivery git '));
    repo = await gitRepoWith(path.join(root, 'lãnh thổ'), { 'README.md': '# demo\n' });
    poisoned = await poisonedGit(repo, root);
    // Every request is refused for want of a credential: git asks its helpers, then gives up.
    server = createServer((_request, response) => {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="elvaria"' }).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    remote = `http://127.0.0.1:${(server.address() as AddressInfo).port}/elvaria-specs/kingdom-repo.git`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, RM);
  });

  it("asks the owner's helper alone, and runs none of the territory's programs", async () => {
    const git = { launch: { file: 'git', args: [] }, env: poisoned.env };
    const limits = { timeout_ms: LIMIT_MS, signal: new AbortController().signal };
    expect((await runDeliveryGit(git, repo, ['status', '--porcelain'], limits)).code).toBe(0);
    const pushed = await runDeliveryGit(git, repo, ['push', remote, 'main'], limits);
    expect(pushed).toMatchObject({ stopped: false });
    expect(pushed.code).not.toBe(0);
    expect(await runsIn(poisoned.poison)).toEqual([]);
    expect(await runsIn(poisoned.owner)).toContain('helper get');

    // The same push without the switches (never spawnSync: the server answers from this process's event loop): the
    // owner's helper has nothing, so git asks the territory's.
    const env = { ...poisoned.env, GIT_TERMINAL_PROMPT: '0' };
    await runToEnd(git.launch, ['push', remote, 'main'], { cwd: repo, env, timeout_ms: LIMIT_MS });
    expect(await runsIn(poisoned.poison)).toContain('helper get');
  });
});
