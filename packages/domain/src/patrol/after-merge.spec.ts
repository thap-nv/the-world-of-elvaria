// The patrol after the default branch moved (CM-03, C8): only a patrolled git territory checked narrowly, once its
// queue is quiet, for a tip no patrol tried or started for; one heavy job at a time, in a free slot; and the merges
// since the latest patrol given back at start.
import { describe, expect, it } from 'vitest';

import { SHA_A, SHA_B, TERRITORY as ELVARIA, merged, ran } from './__fixtures__/patrol-log.ts';
import { afterMergeOf, mergedPatrolOf, mergesSincePatrolOf, patrolsAfterMerge } from './after-merge.ts';
import type { MovedSource } from './after-merge.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Territory } from '../schema/territory.ts';
import type { TerritoryHealth } from './health.ts';

const SHA_C = 'c'.repeat(40);
const A = 'atlas' as TerritoryId;
const B = 'brook' as TerritoryId;
const Q1 = 'q_20261123_mrg001' as QuestId;
const Q2 = 'q_20261123_mrg002' as QuestId;

type Watched = MovedSource['territories'][number];
const GIT: Territory['vcs'] = { type: 'git', default_branch: 'main' };
type Policy = NonNullable<Watched['check_policy']>;
const policy = (mode: Policy['mode']): Policy => ({
  mode,
  full_when: [],
  train: { max_quests: 5, max_wait_minutes: 30 },
});
const NARROW = policy('narrow');

const territory = (id: TerritoryId, more: Partial<Watched> = {}): Watched => ({
  id,
  vcs: GIT,
  patrol: { scans: [] },
  check_policy: NARROW,
  ...more,
});

const health = (id: TerritoryId, head: string | null): TerritoryHealth => ({
  territory: id,
  at: '2026-11-23T06:30:00+07:00',
  head,
  red: [],
  scans: [],
});

const source = (more: Partial<MovedSource> = {}): MovedSource => ({
  territories: [territory(A), territory(B)],
  health: [health(A, SHA_A), health(B, SHA_A)],
  tips: [{ territory: A, head: SHA_B, merges: 3 }],
  tried: new Map(),
  queued: [],
  patrolling: 0,
  room: 1,
  ...more,
});

describe('patrolsAfterMerge', () => {
  it('follows a patrolled git territory checked narrow or deferred, not a full one nor one without a policy', () => {
    expect(patrolsAfterMerge(territory(A))).toBe(true);
    expect(patrolsAfterMerge(territory(A, { check_policy: policy('deferred') }))).toBe(true);
    expect(patrolsAfterMerge(territory(A, { check_policy: policy('full') }))).toBe(false);
    expect(patrolsAfterMerge(territory(A, { check_policy: undefined }))).toBe(false);
    expect(patrolsAfterMerge(territory(A, { patrol: undefined }))).toBe(false);
    expect(patrolsAfterMerge(territory(A, { vcs: { type: 'none' } }))).toBe(false);
  });
});

describe('mergedPatrolOf', () => {
  it('waits for three merges by default, or uses the territory threshold', () => {
    expect(afterMergeOf(undefined)).toEqual({ every: 3, quiet_paths: [] });
    expect(afterMergeOf({ scans: [] })).toEqual({ every: 3, quiet_paths: [] });
    const tips = [{ territory: A, head: SHA_B, merges: 2 }];
    expect(mergedPatrolOf(source({ tips }))).toBeUndefined();
    expect(mergedPatrolOf(source({ tips: [{ territory: A, head: SHA_B, merges: 3 }] }))).toEqual({
      territory: A,
      head: SHA_B,
    });
    const patrol = { scans: [], after_merge: { every: 1, quiet_paths: ['docs/**'] } };
    expect(afterMergeOf(patrol)).toEqual({ every: 1, quiet_paths: ['docs/**'] });
    expect(
      mergedPatrolOf(
        source({ territories: [territory(A, { patrol })], tips: [{ territory: A, head: SHA_B, merges: 1 }] }),
      ),
    ).toEqual({ territory: A, head: SHA_B });
  });

  it('patrols a narrow territory whose branch moved since its latest patrol, for the newest tip', () => {
    expect(mergedPatrolOf(source())).toEqual({ territory: A, head: SHA_B });
    // No patrol has run there yet: any tip is new.
    expect(mergedPatrolOf(source({ health: [] }))).toEqual({ territory: A, head: SHA_B });
  });

  it('patrols no more a full territory, nor a tip its latest patrol tried or a patrol started for', () => {
    const full = [territory(A, { check_policy: undefined })];
    expect(mergedPatrolOf(source({ territories: full }))).toBeUndefined();
    expect(mergedPatrolOf(source({ health: [health(A, SHA_B)] }))).toBeUndefined();
    expect(mergedPatrolOf(source({ tried: new Map([[A, SHA_B]]) }))).toBeUndefined();
    // A tip of a territory the kingdom does not hold.
    expect(mergedPatrolOf(source({ territories: [territory(B)] }))).toBeUndefined();
  });

  it('waits while its merge queue is at work or its branch is red, the queue never for it', () => {
    expect(mergedPatrolOf(source({ queued: [A] }))).toBeUndefined();
    expect(mergedPatrolOf(source({ base_red: [{ territory: A, exempt: [] }] }))).toBeUndefined();
    expect(mergedPatrolOf(source({ queued: [B] }))).toEqual({ territory: A, head: SHA_B });
  });

  it('runs one heavy job at a time, in a free slot of the background', () => {
    expect(mergedPatrolOf(source({ patrolling: 1 }))).toBeUndefined();
    expect(mergedPatrolOf(source({ room: 0 }))).toBeUndefined();
    expect(mergedPatrolOf(source({ room: -1 }))).toBeUndefined();
  });

  it('takes the first territory by id when two moved, the next one at a later tick', () => {
    const tips = [
      { territory: B, head: SHA_C, merges: 3 },
      { territory: A, head: SHA_B, merges: 3 },
    ];
    expect(mergedPatrolOf(source({ tips }))).toEqual({ territory: A, head: SHA_B });
    expect(mergedPatrolOf(source({ tips, health: [health(A, SHA_B)] }))).toEqual({
      territory: B,
      head: SHA_C,
    });
  });
});

describe('mergesSincePatrolOf', () => {
  it('gives the commit of the latest merge on each branch since the latest patrol that tried a commit there', () => {
    const events = [
      merged('2026-11-23T08:00:00+07:00', Q1, true, ELVARIA, SHA_A),
      ran('2026-11-23T08:10:00+07:00', []),
      merged('2026-11-23T09:00:00+07:00', Q1, true, ELVARIA, SHA_B),
      merged('2026-11-23T09:01:00+07:00', Q2, true, ELVARIA, SHA_C),
      // A patrol whose plot could not be made tried nothing: the merges stay.
      ran('2026-11-23T09:05:00+07:00', [], { head: null, plot_failure: 'no default branch' }),
      merged('2026-11-23T09:06:00+07:00', Q2, true, A, SHA_A),
    ];
    expect(mergesSincePatrolOf(events)).toEqual([
      { territory: A, head: SHA_A, merges: 1 },
      { territory: ELVARIA, head: SHA_C, merges: 2 },
    ]);
    expect(mergesSincePatrolOf([...events, ran('2026-11-23T10:00:00+07:00', [])])).toEqual([
      { territory: A, head: SHA_A, merges: 1 },
    ]);
  });
});
