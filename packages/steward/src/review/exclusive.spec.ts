import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { acquireLock } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QuestId } from '@elvaria/domain';

import { RM_TEMP } from '../__fixtures__/kingdom.ts';
import { createJudgeLocks } from './exclusive.ts';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'elvaria judge locks '));
});
afterEach(() => rm(dir, RM_TEMP));

const ONE = 'q_20261109_aaaaaa' as QuestId;
const TWO = 'q_20261109_bbbbbb' as QuestId;

function judgeLocks() {
  const warnings: string[] = [];
  return { locks: createJudgeLocks({ warn: (message) => void warnings.push(message) }), warnings };
}

/** Whether someone else could take `target` now; what it took is given back at once. */
async function free(target: string): Promise<boolean> {
  const taken = await acquireLock(target, { wait: false });
  if (taken.ok) await taken.value.release();
  return taken.ok;
}

describe('the exclusive locks of judges in their scratch plots (P1-20)', () => {
  it("holds a territory's lock for one judge until its release, and says once that another waits", async () => {
    const { locks, warnings } = judgeLocks();
    const target = path.join(dir, '.state', 'checks', 'dc1-exclusive');
    expect(await locks.hold(ONE, target, 'dc1')).toBe(true);
    expect(await locks.hold(ONE, target, 'dc1')).toBe(true);
    expect(await free(target)).toBe(false);
    expect(await locks.hold(TWO, target, 'dc1')).toBe(false);
    expect(await locks.hold(TWO, target, 'dc1')).toBe(false);
    expect(warnings).toEqual([`steward: ${TWO}: its judge waits for the exclusive checks of dc1`]);
    await locks.release(ONE);
    expect(await locks.hold(TWO, target, 'dc1')).toBe(true);
    await locks.release(TWO);
    await locks.release(TWO);
    expect(await free(target)).toBe(true);
  });

  it('releases the locks of quests that lost their judge, and all of them at the end', async () => {
    const { locks } = judgeLocks();
    const first = path.join(dir, 'a');
    const second = path.join(dir, 'b');
    await locks.hold(ONE, first, 'a');
    await locks.hold(TWO, second, 'b');
    await locks.sweep((quest) => quest === TWO);
    expect([await free(first), await free(second)]).toEqual([true, false]);
    await locks.releaseAll();
    expect(await free(second)).toBe(true);
  });
});
