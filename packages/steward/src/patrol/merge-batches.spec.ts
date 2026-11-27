import { TerritorySchema } from '@elvaria/domain';
import type { KingdomSnapshot, Territory, TerritoryTrial } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { patrolMerged } from './again.ts';
import { createPatrolBook, recordPatrolMerge } from './book.ts';
import type { Context } from '../context.ts';
import type { Recorder } from '../quest/record.ts';

function context(territory: Territory, trial: () => Promise<TerritoryTrial>) {
  const lines: Parameters<Recorder['note']>[0][] = [];
  const log = {
    warn: (message: string) => {
      throw new Error(message);
    },
  };
  const ctx = {
    patrol: createPatrolBook(log),
    stopping: new AbortController().signal,
    world: {
      territories: new Map([[territory.id, territory]]),
      quests: new Map(),
      kingdom: { dispatch: { max_background: 1 } },
    },
    background: { view: () => ({ running: [] }) },
    delegation: { suspensions: [] },
    record: {
      stamp: () => '2026-11-27T09:00:00+07:00',
      note: (line: Parameters<Recorder['note']>[0]) => {
        lines.push(line);
        return Promise.resolve();
      },
    },
    deps: {
      log,
      clock: { now: () => 0 },
      events: { read: () => Promise.resolve({ events: [] }) },
      plots: {
        patrol: trial,
      },
    },
  } as unknown as Context;
  return { ctx, lines };
}

function open(every = 3) {
  const territory = TerritorySchema.parse({
    version: 1,
    id: 'code',
    name: 'Code',
    path: 'C:/code',
    kind: 'code',
    vcs: { type: 'git', default_branch: 'main' },
    check_policy: { mode: 'narrow' },
    patrol: { after_merge: { every } },
  });
  let head = 'initial';
  let during: (() => Promise<void>) | undefined;
  const { ctx, lines } = context(territory, async () => {
    const base = head;
    await during?.();
    return { base, setup: null, checks: [] };
  });
  const snapshot = { quests: [], territories: [territory] } as unknown as KingdomSnapshot;
  return {
    ctx,
    territory,
    merge: (next: string) => {
      head = next;
      recordPatrolMerge(ctx.patrol, territory.id, next);
    },
    during: (work?: () => Promise<void>) => {
      during = work;
    },
    run: async () => {
      await patrolMerged(ctx, snapshot);
      await ctx.patrol.runs.idle();
    },
    heads: () => lines.filter(({ type }) => type === 'patrol.ran').map(({ data }) => data),
  };
}

describe('the live merge batches (613)', () => {
  it('starts a fresh batch after the previous patrol: two merges wait, the third runs', async () => {
    const bench = open();
    for (const head of ['a', 'b', 'c']) bench.merge(head);
    await bench.run();
    expect(bench.heads()).toMatchObject([{ trigger: 'merged', head: 'c' }]);
    bench.merge('d');
    bench.merge('e');
    await bench.run();
    expect(bench.heads()).toHaveLength(1);
    bench.merge('f');
    await bench.run();
    expect(bench.heads()).toMatchObject([{ head: 'c' }, { head: 'f' }]);
  });

  it('patrols a merge that arrived while the preceding head was being checked', async () => {
    const bench = open(1);
    bench.merge('x');
    bench.during(() => {
      bench.merge('y');
      return Promise.resolve();
    });
    await bench.run();
    bench.during();
    await bench.run();
    expect(bench.heads()).toMatchObject([{ head: 'x' }, { head: 'y' }]);
  });
});
