// The probe after a red patrol (CM-04) on a real git repo whose path has spaces, with real checks: the owner's patrol
// finds main green, merges and commits move it, the next patrol finds it red, and the probe names why in one
// `check.attributed`: the second of three merges red on its own (own_change, that quest), two merges red only together
// (combination, the later one), the owner's own commit (outside), a check red once then green (flaky), and a branch
// red at its first patrol (unknown, nothing run). The quests' merges are the log's `delivery.merged` lines.
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { QuestId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CODE,
  Q1,
  Q2,
  Q3,
  attributions,
  commitOn,
  deliver,
  openProbe,
  patrolNow,
} from '../__fixtures__/probe.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** The bench of the probe, removed after the test. */
async function open(state = 'green') {
  const opened = await openProbe(state);
  current = opened.kingdom;
  running = opened.steward;
  return opened;
}

const ran = (commit: string, pass: boolean, quest?: QuestId) => ({
  commit,
  ...(quest === undefined ? {} : { quest }),
  pass,
  duration_ms: expect.any(Number) as unknown,
});

describe('the probe after a red patrol (CM-04)', () => {
  it('three merges, the second red on its own: own_change, that quest', async () => {
    const { kingdom, repo, steward, green } = await open();
    await patrolNow(kingdom, steward);
    const first = await deliver(kingdom, repo, Q1, green, { 'a.txt': 'a\n' });
    const second = await deliver(kingdom, repo, Q2, green, { 'state.txt': 'red\n' });
    await deliver(kingdom, repo, Q3, green, { 'b.txt': 'b\n' });
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      {
        territory: CODE,
        source: 'patrol',
        checks: ['unit'],
        runs: [
          ran(first.merge, true),
          ran(second.merge, false),
          ran(second.merge, false),
          ran(second.own, false, Q2),
        ],
        commit: second.merge,
        culprit: Q2,
        cause: 'own_change',
      },
    ]);
    // Attributed: the next patrol of the still red branch probes nothing again, and the probe's plot is gone.
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toHaveLength(1);
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', `probe-${CODE}`))).toBe(false);
  });

  it("red only once merged together: combination, the later quest, its own head before the queue's update", async () => {
    const { kingdom, repo, steward, green } = await open();
    await patrolNow(kingdom, steward);
    const first = await deliver(kingdom, repo, Q1, green, { 'x.txt': 'x\n' });
    const second = await deliver(kingdom, repo, Q2, green, { 'y.txt': 'y\n' }, true);
    await patrolNow(kingdom, steward);
    const [found] = await attributions(kingdom);
    expect(found).toMatchObject({ commit: second.merge, culprit: Q2, cause: 'combination' });
    // Two steps: the first merge green, the second red again, then Q2's own commit (y alone) green.
    expect(found?.runs).toEqual([
      ran(first.merge, true),
      ran(second.merge, false),
      ran(second.own, true, Q2),
    ]);
  });

  it("the owner's own commit: outside, no culprit", async () => {
    const { kingdom, repo, steward, green } = await open();
    await patrolNow(kingdom, steward);
    const first = await deliver(kingdom, repo, Q1, green, { 'a.txt': 'a\n' });
    const owner = await commitOn(repo, { 'state.txt': 'red\n' }, 'by hand');
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      expect.objectContaining({
        runs: [ran(first.merge, true), ran(owner, false)],
        commit: owner,
        cause: 'outside',
      }),
    ]);
    expect((await attributions(kingdom))[0]).not.toHaveProperty('culprit');
  });

  it('red once, green when run again on the same commit: flaky', async () => {
    const { kingdom, repo, steward } = await open();
    await patrolNow(kingdom, steward);
    const owner = await commitOn(repo, { 'notes.md': '# notes\n' }, 'notes');
    await writeFile(path.join(kingdom.root, 'flake'), 'once\n');
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      expect.objectContaining({ runs: [ran(owner, true)], commit: owner, cause: 'flaky' }),
    ]);
  });

  it('red at its first patrol: no green head, unknown, nothing run', async () => {
    const { kingdom, steward } = await open('red');
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      { territory: CODE, source: 'patrol', checks: ['unit'], runs: [], cause: 'unknown' },
    ]);
  });
});
