// A sealed quest on a territory that delivers by `pr_merge` (implementation-plan §3.16.7, ADR 0023; PS-08d) on a real
// git repo whose origin is a bare repo, with a fake forge that merges there for real: the Steward asks the forge every
// 30 seconds, merges at the head it pushed, deletes the remote quest branch only while its tip is that head, and
// archives the quest, its plot released. Red checks, the time limit, a moved head and an unsealed quest stop short.
import { openEventLog } from '@elvaria/eventlog';
import { pathExists } from '@elvaria/store';
import { reduce } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { forgeBench } from './__fixtures__/forge-bench.ts';
import { git } from './__fixtures__/git-plots.ts';
import { questPayload, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import type { ForgeBench } from './__fixtures__/forge-bench.ts';
import type { Steward } from './types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const PR_MERGE = { mode: 'pr_merge' };
const TITLE = 'Rooms API';
const LIMIT_MINUTES = 60;

const statusOf = async (bench: ForgeBench) => (await bench.kingdom.quest(TITLE)).status;
const methods = (bench: ForgeBench) => bench.forge.calls.map(({ method }) => method);
const branchesOf = (bench: ForgeBench) =>
  git(bench.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads');

/** A quest that waits for the seal, sealed, and taken to its pull request; the quest, its branch and its head. */
async function sealedAndPushed(bench: ForgeBench, steward: Steward, fields: Record<string, unknown> = {}) {
  const { kingdom } = bench;
  await kingdom.command('create_quest', questPayload(TITLE, { seal_required: true, ...fields }));
  await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench)) === 'awaiting_seal');
  const quest = await kingdom.quest(TITLE);
  await kingdom.command('seal', { quest: quest.id });
  await tickUntil(steward, kingdom.clock, async () => (await bench.lines('delivery.pushed')).length > 0);
  const branch = `quest/${quest.id}`;
  return { quest, branch, head: git(bench.repo, 'rev-parse', branch) };
}

describe('a sealed quest on a territory that delivers by pr_merge', () => {
  it('is merged at its head, its remote branch deleted, the others untouched, then archived with its plot released', async () => {
    current = await forgeBench({ delivery: PR_MERGE, release: true });
    const bench = current;
    git(bench.repo, 'push', '-q', 'origin', 'main:refs/heads/other');
    const other = bench.remoteTip('other');
    const steward = await bench.start();
    const { quest, branch, head } = await sealedAndPushed(bench, steward);
    await tickUntil(steward, bench.kingdom.clock, async () => (await statusOf(bench)) === 'archived');

    const [line, ...more] = await bench.lines('delivery.merged');
    expect(more).toEqual([]);
    expect(line).toMatchObject({ quest: quest.id, territory: 'dc1-se-team', actor: { kind: 'steward' } });
    expect(line?.data).toEqual({
      quest: quest.id,
      territory: 'dc1-se-team',
      branch,
      head,
      pr: { number: 1, url: 'https://github.com/elvaria-specs/kingdom-repo/pull/1' },
      merge_sha: bench.forge.merged.get(1),
      method: 'merge',
      sealed: true,
      branch_deleted: true,
    });
    // required_checks is empty: the forge said it could merge, and nothing waited.
    expect(methods(bench)).toEqual(['open', 'status', 'merge', 'deleteBranch']);
    expect(branchesOf(bench)).toBe('refs/heads/main\nrefs/heads/other');
    expect(bench.remoteTip('other')).toBe(other);
    expect(git(bench.remote, 'merge-base', '--is-ancestor', head, 'main')).toBe('');
    const archived = (await bench.lines('quest.archived')).at(-1);
    expect(archived).toMatchObject({ quest: quest.id, actor: { kind: 'steward' } });
    expect(await pathExists(quest.plot.path ?? '')).toBe(false);
    expect(await bench.lines('delivery.failed')).toEqual([]);
    const events = (await openEventLog(bench.kingdom.root).read()).events;
    expect(reduce(await bench.kingdom.morning(), events)).toEqual(await worldOfFiles(bench.kingdom.store));
  });

  it('waits while the checks are pending, every 30 seconds, then merges once they are green', async () => {
    current = await forgeBench({ delivery: { ...PR_MERGE, required_checks: ['ci'] } });
    const bench = current;
    bench.forge.answer({ state: 'pending', checks: [{ name: 'ci', conclusion: 'in_progress' }] });
    const steward = await bench.start();
    await sealedAndPushed(bench, steward);
    await steward.tick();
    await steward.idle();
    const asked = methods(bench).filter((method) => method === 'status').length;
    // Fifteen seconds later the Steward does not ask again; a minute later (tickUntil), it does.
    bench.kingdom.clock.advance(1 / 4);
    await steward.tick();
    await steward.idle();
    expect(methods(bench).filter((method) => method === 'status')).toHaveLength(asked);
    bench.forge.answer({ state: 'green' });
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.merged')).length > 0,
    );
    expect(methods(bench).slice(-3)).toEqual(['status', 'merge', 'deleteBranch']);
    expect(await bench.lines('delivery.failed')).toEqual([]);
  });

  it('stops at red checks: one delivery.failed naming them, the quest still done, nothing merged', async () => {
    current = await forgeBench({ delivery: { ...PR_MERGE, required_checks: ['ci'] } });
    const bench = current;
    const red = { name: 'ci', conclusion: 'failure', url: 'https://ci.example/1' };
    bench.forge.answer({ state: 'red', checks: [red] });
    const steward = await bench.start();
    const { quest, branch, head } = await sealedAndPushed(bench, steward);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.failed')).length > 0,
    );
    for (let tick = 0; tick < 3; tick += 1) {
      await steward.tick();
      await steward.idle();
      bench.kingdom.clock.advance(1);
    }
    const failed = await bench.lines('delivery.failed');
    expect(failed.map(({ data }) => data)).toEqual([
      {
        quest: quest.id,
        territory: 'dc1-se-team',
        stage: 'checks',
        reason: 'checks_red',
        branch,
        head,
        pr: { number: 1, url: 'https://github.com/elvaria-specs/kingdom-repo/pull/1' },
        checks: [red],
      },
    ]);
    expect(methods(bench)).toEqual(['open', 'status']);
    expect(await statusOf(bench)).toBe('done');
    expect(bench.remoteTip(branch)).toBe(head);
  });

  // Real git with a bare origin, and the Steward's ticks over the hour of checks_timeout_minutes on the fake
  // clock, the forge asked at each: 15 s beside 13 other slow specs on Windows (2026-11-18), room for a busy machine.
  it('stops once checks_timeout_minutes passed since the push, the checks still pending', async () => {
    current = await forgeBench({ delivery: { ...PR_MERGE, checks_timeout_minutes: LIMIT_MINUTES } });
    const bench = current;
    bench.forge.answer({ state: 'pending' });
    const steward = await bench.start();
    await sealedAndPushed(bench, steward);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.failed')).length > 0,
      90,
    );
    const [failed] = await bench.lines('delivery.failed');
    expect(failed?.data).toMatchObject({ stage: 'checks', reason: 'checks_timeout' });
    expect(methods(bench)).not.toContain('merge');
  }, 240_000);

  it('neither merges nor deletes when the branch moved on the remote', async () => {
    current = await forgeBench({ delivery: PR_MERGE });
    const bench = current;
    bench.forge.answer({ state: 'pending' });
    const steward = await bench.start();
    const { branch, head } = await sealedAndPushed(bench, steward);
    // Someone pushed to the quest branch on the forge.
    git(bench.repo, 'commit', '-q', '--allow-empty', '-m', 'by hand');
    git(bench.repo, 'push', '-q', '--force', 'origin', `main:refs/heads/${branch}`);
    const moved = bench.remoteTip(branch);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.failed')).length > 0,
    );
    const [failed] = await bench.lines('delivery.failed');
    expect(failed?.data).toMatchObject({ stage: 'merge', reason: 'head_moved', head });
    expect(methods(bench)).not.toContain('merge');
    expect(methods(bench)).not.toContain('deleteBranch');
    expect(bench.remoteTip(branch)).toBe(moved);
  });

  it('records a pull request the owner merged by hand as merged, the branch deleted all the same', async () => {
    current = await forgeBench({ delivery: PR_MERGE });
    const bench = current;
    bench.forge.answer({ state: 'pending' });
    const steward = await bench.start();
    const { branch } = await sealedAndPushed(bench, steward);
    const sha = bench.forge.mergeByHand(branch);
    await tickUntil(steward, bench.kingdom.clock, async () => (await statusOf(bench)) === 'archived');
    const [merged] = await bench.lines('delivery.merged');
    expect(merged?.data).toMatchObject({ merge_sha: sha, branch_deleted: true });
    expect(methods(bench)).not.toContain('merge');
  });
});

describe('a quest without the seal on a pr_merge territory', () => {
  it('stops at its pull request, as under pr: the forge is never asked about it', async () => {
    current = await forgeBench({ delivery: PR_MERGE });
    const bench = current;
    const steward = await bench.start();
    await bench.kingdom.command('create_quest', questPayload(TITLE));
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.pushed')).length > 0,
    );
    for (let tick = 0; tick < 3; tick += 1) {
      await steward.tick();
      await steward.idle();
      bench.kingdom.clock.advance(1);
    }
    expect(methods(bench)).toEqual(['open']);
    expect(await statusOf(bench)).toBe('done');
  });
});
