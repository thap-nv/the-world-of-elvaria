// The merge queue's merge quest (PS-09b) on the forge bench, a real git repo and a fake forge that merges for real: a
// conflict no rule of shared_paths resolves opens one merge quest for a knight instead of leaving it to the owner. The
// machine's first run stops on the conflict, a knight concludes it, a judge who never worked the quest reads it, and
// with the owner's seal it goes through the queue itself and takes the quest it stands for into main; both plots go.
// Dropped, it is not opened again for the same commit of main, and the stop is the owner's again.
import { isQueueMerge } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { git } from './__fixtures__/git-plots.ts';
import { tickUntil } from './__fixtures__/kingdom.ts';
import { onMain, queueBench, sealedTogether, statusOf } from './__fixtures__/queue.ts';
import type { Leaves } from './__fixtures__/deliver.ts';
import type { ForgeBench } from './__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

/** Alpha and Beta write one file no rule names; the knight of a merge quest keeps both sides. */
const LEAVES: Leaves = (req) => {
  if (req.quest?.party_role === 'merge') return { 'src/rooms.ts': 'alpha\nbeta\n' };
  if (req.quest?.title === 'Alpha') return { 'src/rooms.ts': 'alpha\n' };
  return req.quest?.title === 'Beta' ? { 'src/rooms.ts': 'beta\n' } : {};
};

const mergesOf = async (bench: ForgeBench) => (await bench.kingdom.quests()).filter(isQueueMerge);

/**
 * The repo's worktrees, as git lists them: a released plot is not among them. Its folder may stay a while on Windows
 * (a process still holds a file: the release's `leftover`), so the folder is not what the release is.
 */
const slashed = (text: string): string => text.replaceAll('\\', '/').toLowerCase();

const listed = (bench: ForgeBench, plot: { readonly path?: string | undefined }): boolean =>
  slashed(git(bench.repo, 'worktree', 'list', '--porcelain')).includes(slashed(plot.path ?? ''));

const workersOf = (quest: { attempt_log: readonly { role: string; character: string | null }[] }) =>
  quest.attempt_log.filter(({ role }) => role === 'assignee').map(({ character }) => character);

describe("the merge queue's merge quest (PS-09b)", () => {
  // Timeout: real git and the fake forge through two deliveries, a machine's run, a knight's and a judge's sessions,
  // some 300 ticks; minutes when other worktrees run their checks at the same time.
  it('resolves a conflict no rule resolves in one merge quest, and takes the quest into main with it', async () => {
    const { bench, steward } = await queueBench(LEAVES, { release: true });
    current = bench;
    const { kingdom } = bench;
    await sealedTogether(bench, steward, ['Alpha', 'Beta']);
    const awaiting = async () => (await mergesOf(bench))[0]?.status === 'awaiting_seal';
    await tickUntil(steward, kingdom.clock, awaiting, 300);

    const beta = await kingdom.quest('Beta');
    const [merge, ...more] = await mergesOf(bench);
    expect(more).toEqual([]);
    expect(merge).toMatchObject({
      parent_id: beta.id,
      party_id: beta.id,
      party_role: 'merge',
      seal_required: true,
      depends_on: [beta.id],
    });
    const [failed] = await bench.lines('delivery.failed');
    expect(failed?.data).toMatchObject({
      quest: beta.id,
      stage: 'update',
      reason: 'conflict',
      paths: ['src/rooms.ts'],
      merge_quest: merge?.id,
    });
    expect(kingdom.notices.find(({ kind }) => kind === 'delivery_failed')).toMatchObject({
      merge_quest: merge?.id,
    });
    // The machine's run stopped on the conflict, rang once, and a knight concluded it in the next run.
    expect(
      merge?.attempt_log.filter(({ role }) => role === 'assignee').map(({ outcome }) => outcome),
    ).toEqual(['cancelled', 'submitted']);
    expect(kingdom.notices.filter(({ kind }) => kind === 'merge_stopped')).toHaveLength(1);
    const judges = merge?.attempt_log.filter(({ role }) => role === 'verifier') ?? [];
    expect(judges.length).toBeGreaterThan(0);
    expect(judges.filter(({ character }) => workersOf(beta).includes(character))).toEqual([]);
    expect([listed(bench, beta.plot), listed(bench, merge?.plot ?? {})]).toEqual([true, true]);

    await kingdom.command('seal', { quest: merge?.id ?? '' });
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Beta')) === 'archived', 300);
    expect(onMain(bench, 'src/rooms.ts')).toBe('alpha\nbeta');
    const [archived] = await mergesOf(bench);
    expect(archived?.status).toBe('archived');
    expect(listed(bench, beta.plot)).toBe(false);
    expect(listed(bench, archived?.plot ?? {})).toBe(false);
    for (let tick = 0; tick < 3; tick += 1) {
      await steward.tick();
      await steward.idle();
    }
    expect(await mergesOf(bench)).toHaveLength(1);
    expect(await bench.lines('delivery.failed')).toHaveLength(1);
  }, 300_000);

  // Timeout: real git and the fake forge through three deliveries; minutes on a busy machine.
  it('opens no second merge quest for the same commit of main once the owner dropped the first', async () => {
    const { bench, steward } = await queueBench(LEAVES);
    current = bench;
    const { kingdom } = bench;
    await sealedTogether(bench, steward, ['Alpha', 'Beta']);
    await tickUntil(steward, kingdom.clock, async () => (await mergesOf(bench)).length > 0, 200);
    const [merge] = await mergesOf(bench);
    await kingdom.command('cancel', { quest: merge?.id ?? '' });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await mergesOf(bench))[0]?.status === 'archived',
      60,
    );
    const beta = await kingdom.quest('Beta');
    await kingdom.command('deliver', { quest: beta.id });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await bench.lines('delivery.failed')).length === 2,
      120,
    );

    expect(await mergesOf(bench)).toHaveLength(1);
    const again = (await bench.lines('delivery.failed')).at(-1);
    expect(again?.data).toMatchObject({ quest: beta.id, reason: 'conflict', merge_quest: merge?.id });
    expect(await statusOf(bench, 'Beta')).toBe('done');
  }, 240_000);
});
