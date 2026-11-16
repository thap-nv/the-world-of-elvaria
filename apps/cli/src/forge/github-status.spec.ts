// Where a quest's pull request stands on GitHub (PS-08c, for PS-08d's `pr_merge`), against a fake GitHub: merged,
// closed, in conflict, and its required checks read from the head's check runs and commit statuses.
import { err } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { FAKE_TOKEN } from '../../test/credential.ts';
import { HEAD, REPO, at, forgeOver } from '../../test/github.ts';
import type { Reply, Routes } from '../../test/github.ts';

const PR = 7;
const pull = `GET ${at('pulls', String(PR))}`;
const runs = `GET ${at('commits', HEAD, 'check-runs')}`;
const statuses = `GET ${at('commits', HEAD, 'status')}`;
const RUN_URL = 'https://github.com/elvaria-specs/kingdom-repo/actions/runs/1';
const STATUS_URL = 'https://ci.example.com/build/1';

const pullBody = (extra: Record<string, unknown>) => ({
  state: 'open',
  merged: false,
  head: { sha: HEAD },
  ...extra,
});
const run = (name: string, status: string, conclusion: string | null = null) => ({
  name,
  status,
  conclusion,
  html_url: RUN_URL,
});
const commitStatus = (context: string, state: string) => ({ context, state, target_url: STATUS_URL });

/** The pull request's answer, then its head's check runs and statuses. */
function statusOf(
  pr: Record<string, unknown>,
  required: readonly string[] = [],
  checks: { runs?: unknown[]; statuses?: unknown[] } = {},
  more: Routes = {},
) {
  const routes: Routes = {
    [pull]: { status: 200, body: pullBody(pr) },
    [runs]: { status: 200, body: { total_count: 0, check_runs: checks.runs ?? [] } },
    [statuses]: { status: 200, body: { state: 'pending', statuses: checks.statuses ?? [] } },
    ...more,
  };
  return forgeOver(routes, FAKE_TOKEN).forge.status(REPO, PR, required);
}

const stands = (state: string, checks: unknown[] = []) => ({
  ok: true,
  value: { state, head: HEAD, checks },
});

describe('githubForge.status', () => {
  it('says merged, closed, or a conflict before it reads any check', async () => {
    expect(await statusOf({ merged: true, state: 'closed' }, ['ci'])).toEqual(stands('merged'));
    expect(await statusOf({ state: 'closed' }, ['ci'])).toEqual(stands('closed'));
    expect(await statusOf({ mergeable: false }, ['ci'])).toEqual(stands('conflict'));
  });

  it("leaves it to GitHub's mergeable with no required check: true is green, null not computed yet", async () => {
    expect(await statusOf({ mergeable: true })).toEqual(stands('green'));
    expect(await statusOf({ mergeable: null })).toEqual(stands('pending'));
  });

  it('is green when every required check run passed, and waits on mergeable all the same', async () => {
    const passed = { runs: [run('ci', 'completed', 'success'), run('lint', 'completed', 'skipped')] };
    expect(await statusOf({ mergeable: true }, ['ci', 'lint'], passed)).toEqual(stands('green'));
    expect(await statusOf({ mergeable: null }, ['ci', 'lint'], passed)).toEqual(stands('pending'));
  });

  it('is red with the failed check, its conclusion and its address', async () => {
    const failed = { runs: [run('ci', 'completed', 'failure'), run('lint', 'in_progress')] };
    expect(await statusOf({ mergeable: true }, ['ci', 'lint'], failed)).toEqual(
      stands('red', [{ name: 'ci', conclusion: 'failure', url: RUN_URL }]),
    );
  });

  it('waits on a check run in progress, and on one the head does not have yet', async () => {
    const running = { runs: [run('ci', 'in_progress'), run('other', 'completed', 'failure')] };
    expect(await statusOf({ mergeable: true }, ['ci', 'e2e'], running)).toEqual(
      stands('pending', [
        { name: 'ci', conclusion: 'in_progress', url: RUN_URL },
        { name: 'e2e', conclusion: 'missing' },
      ]),
    );
  });

  it("counts a commit status's context as a check too", async () => {
    const legacy = (state: string) => ({ statuses: [commitStatus('ci/legacy', state)] });
    expect(await statusOf({ mergeable: true }, ['ci/legacy'], legacy('success'))).toEqual(stands('green'));
    expect(await statusOf({ mergeable: true }, ['ci/legacy'], legacy('pending'))).toEqual(
      stands('pending', [{ name: 'ci/legacy', conclusion: 'pending', url: STATUS_URL }]),
    );
    const mixed = { runs: [run('ci', 'completed', 'success')], statuses: [commitStatus('deploy', 'error')] };
    expect(await statusOf({ mergeable: true }, ['ci', 'deploy'], mixed)).toEqual(
      stands('red', [{ name: 'deploy', conclusion: 'error', url: STATUS_URL }]),
    );
  });

  it('gives back a forge that could not say where the pull request or its checks stand', async () => {
    const down: Reply = { status: 502 };
    expect(await statusOf({}, ['ci'], {}, { [pull]: down })).toEqual(
      err({ reason: 'forge_error', detail: 'HTTP 502' }),
    );
    expect(await statusOf({ mergeable: true }, ['ci'], {}, { [runs]: { status: 401 } })).toEqual(
      err({ reason: 'forge_auth', detail: 'HTTP 401' }),
    );
    expect(await statusOf({ mergeable: true }, ['ci'], {}, { [statuses]: down })).toEqual(
      err({ reason: 'forge_error', detail: 'HTTP 502' }),
    );
  });

  it('reads a check-runs answer with no list as no check at all', async () => {
    const empty: Routes = { [runs]: { status: 200, body: {} }, [statuses]: { status: 200, body: {} } };
    expect(await statusOf({ mergeable: true }, ['ci'], {}, empty)).toEqual(
      stands('pending', [{ name: 'ci', conclusion: 'missing' }]),
    );
  });
});
