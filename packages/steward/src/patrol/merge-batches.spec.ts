import { EVENT_VERSION, EventSchema, TerritorySchema } from '@elvaria/domain';
import type { KingdomSnapshot, Territory, TerritoryTrial } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { patrolMerged } from './again.ts';
import { createPatrolBook, recordLookedHead, recordPatrolMerge, recoverPatrol } from './book.ts';
import { patrolTerritory } from './patrol.ts';
import { createLaneRuns } from '../forge/lane-runs.ts';
import { startLook } from '../forge/look.ts';
import { createBaseLooks } from '../forge/looks.ts';
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
    trains: createLaneRuns(log),
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
    look: (next: string) => {
      head = next;
      recordLookedHead(ctx.patrol, territory.id, next);
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
  it('(625) records fetched remote heads through the base look, ignoring a stale fetched tip', async () => {
    const bench = open();
    let remote = 'initial';
    const ctx = {
      ...bench.ctx,
      looks: createBaseLooks(bench.ctx.deps.log),
      deps: {
        ...bench.ctx.deps,
        plots: {
          ...bench.ctx.deps.plots,
          baseTips: () => Promise.resolve({ local: 'local', remote }),
          inBase: () => Promise.resolve(false),
        },
      },
    };
    for (const tip of ['initial', 'manual', 'initial']) {
      remote = tip;
      startLook(ctx, { territory: bench.territory.id, quests: [] });
      await ctx.looks.idle();
    }
    expect(ctx.patrol.heads.get(bench.territory.id)).toBe('manual');
    expect(ctx.patrol.merges.get(bench.territory.id)).toBe(1);
  });

  it('(625) counts manual heads mixed with delivery merges and never recounts a patrolled tip', async () => {
    const bench = open();
    bench.look('initial');
    bench.look('manual-a');
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(1);
    bench.merge('delivery');
    await bench.run();
    expect(bench.heads()).toEqual([]);
    bench.look('manual-b');
    await bench.run();
    expect(bench.heads()).toMatchObject([{ trigger: 'merged', head: 'manual-b' }]);
    bench.look('manual-b');
    expect(bench.ctx.patrol.merges.has(bench.territory.id)).toBe(false);
    expect(bench.ctx.patrol.heads.has(bench.territory.id)).toBe(false);
  });

  it('(625) counts a look and a delivery of the same commit once in either order', () => {
    const bench = open();
    bench.look('initial');
    bench.look('a');
    bench.merge('a');
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(1);
    bench.merge('b');
    bench.look('b');
    bench.look('a');
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(2);
    expect(bench.ctx.patrol.heads.get(bench.territory.id)).toBe('b');
  });

  it('(625) forgets live looks at recovery and seeds the first look without counting', () => {
    const bench = open();
    bench.look('initial');
    bench.look('a');
    recoverPatrol(bench.ctx.patrol, []);
    expect(bench.ctx.patrol.seen.size).toBe(0);
    bench.look('b');
    expect(bench.ctx.patrol.heads.get(bench.territory.id)).toBe('b');
    expect(bench.ctx.patrol.merges.size).toBe(0);
    bench.look('c');
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(1);
  });

  it('(625) retains only the latest twenty distinct heads per territory', () => {
    const bench = open();
    const other = TerritorySchema.parse({ ...bench.territory, id: 'other' });
    recordPatrolMerge(bench.ctx.patrol, other.id, 'other-head');
    bench.look('initial');
    for (let n = 1; n <= 21; n += 1) bench.merge(`head-${n}`);
    bench.look('head-2');
    expect(bench.ctx.patrol.seen.get(bench.territory.id)).toEqual([
      'head-2',
      'head-3',
      'head-4',
      'head-5',
      'head-6',
      'head-7',
      'head-8',
      'head-9',
      'head-10',
      'head-11',
      'head-12',
      'head-13',
      'head-14',
      'head-15',
      'head-16',
      'head-17',
      'head-18',
      'head-19',
      'head-20',
      'head-21',
    ]);
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(21);
    expect(bench.ctx.patrol.seen.get(other.id)).toEqual(['other-head']);
  });

  it('(625) seeds remembered heads from recovered delivery merges', () => {
    const bench = open();
    const head = 'a'.repeat(40);
    const event = EventSchema.parse({
      v: EVENT_VERSION,
      id: '01JC0000000000000000000001',
      ts: '2026-11-27T09:00:00+07:00',
      type: 'delivery.merged',
      actor: { kind: 'steward' },
      data: {
        quest: 'q_20261127_000001',
        territory: bench.territory.id,
        branch: 'quest/q_20261127_000001',
        head,
        pr: { number: 7, url: 'https://github.com/o/r/pull/7' },
        merge_sha: head,
        method: 'merge',
        sealed: true,
        branch_deleted: true,
      },
    });
    recoverPatrol(bench.ctx.patrol, [event]);
    bench.look(head);
    bench.merge(head);
    expect(bench.ctx.patrol.seen.get(bench.territory.id)).toEqual([head]);
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(1);
    bench.look('manual');
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(2);
  });

  it('(625) remembers a scheduled patrol head even before any look or delivery', async () => {
    const bench = open();
    await patrolTerritory(bench.ctx, bench.territory, 'schedule', bench.ctx.stopping);
    bench.look('initial');
    expect(bench.ctx.patrol.heads.size).toBe(0);
    expect(bench.ctx.patrol.merges.size).toBe(0);
    expect(bench.ctx.patrol.seen.get(bench.territory.id)).toEqual(['initial']);
  });

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

  it('(622) counts the quests of one train, merged by one merge commit, as one merge', async () => {
    const bench = open();
    for (const head of ['a', 'b', 'b', 'b']) bench.merge(head);
    await bench.run();
    expect(bench.heads()).toEqual([]);
    expect(bench.ctx.patrol.merges.get(bench.territory.id)).toBe(2);
    bench.merge('c');
    await bench.run();
    expect(bench.heads()).toMatchObject([{ trigger: 'merged', head: 'c' }]);
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

  it('(CM-08) waits while a delivery train runs, heavy work as a patrol is, and patrols once it ended', async () => {
    const bench = open(1);
    bench.merge('x');
    let leave = (): void => undefined;
    const train = new Promise<void>((resolve) => {
      leave = resolve;
    });
    bench.ctx.trains.start(bench.territory.id, 'the train of code', () => train);
    await bench.run();
    expect(bench.heads()).toEqual([]);
    leave();
    await bench.ctx.trains.idle();
    await bench.run();
    expect(bench.heads()).toMatchObject([{ trigger: 'merged', head: 'x' }]);
  });
});
