// The patrol after a merge (CM-03, C8 turns K16 around) on the forge bench: two sealed quests merged one after the
// other by the queue of a patrolled `narrow` territory are patrolled once, at the head the second merge left, and the
// second quest's delivery goes on while that patrol has not run; a patrolled territory that names no check policy
// (`full`) is not patrolled after its merges.
import type { TerritoryTrial } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { settled, tickUntil } from '../__fixtures__/kingdom.ts';
import { queueBench, sealedTogether, sourceWithIndex, titlesOf } from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { Plots, Steward } from '../types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const CHECKS = [
  { id: 'unit', run: 'pnpm -r test', narrow: 'pnpm test:changed', when: ['src/**'], timeout_minutes: 5 },
];

/** Ticks a few times, the work outside each tick ended: a patrol due after the merges has run. */
async function quiet(steward: Steward): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await steward.tick();
    await settled(steward);
  }
}

/** Alpha and Beta sealed together on a patrolled territory, both merged; the heads the patrols tried, in order. */
async function mergedTwice(policy: Readonly<Record<string, unknown>> | null) {
  const leaves = { Alpha: sourceWithIndex('alpha.ts'), Beta: sourceWithIndex('beta.ts') };
  const territory = {
    checks: CHECKS,
    patrol: { scans: [] },
    ...(policy === null ? {} : { check_policy: policy }),
  };
  const { bench, steward: first } = await queueBench(leaves, { territory });
  current = bench;
  await first.stop();
  const tried: string[] = [];
  // The patrol tries the head of the remote's main as a fetch finds it, green; the quests' checks pass.
  const patrol: Plots['patrol'] = () => {
    const base = git(bench.remote, 'rev-parse', 'main');
    tried.push(base);
    const trial: TerritoryTrial = { base, setup: null, checks: [] };
    return Promise.resolve(trial);
  };
  const check: Plots['check'] = () => Promise.resolve([]);
  const steward = await bench.start({ plots: { ...gitPlots(bench.kingdom.root), check, patrol } });
  await sealedTogether(bench, steward, ['Alpha', 'Beta']);
  const merged = async () => (await titlesOf(bench, 'delivery.merged')).length === 2;
  await tickUntil(steward, bench.kingdom.clock, merged, 200);
  await quiet(steward);
  const merges = (await bench.lines('delivery.merged')).map(({ data }) => data.merge_sha);
  const patrols = (await bench.lines('patrol.ran')).map(({ data }) => [data.trigger, data.head]);
  const order = (await openEventLog(bench.kingdom.root).read()).events
    .filter(({ type }) => type === 'delivery.merged' || type === 'patrol.ran')
    .map(({ type }) => type);
  return { tried, merges, patrols, order };
}

describe('the patrol after a merge (CM-03)', () => {
  it('patrols a narrow territory once after two merges in a row, at the head of the second', async () => {
    const { tried, merges, patrols, order } = await mergedTwice({ mode: 'narrow' });
    expect(merges).toHaveLength(2);
    expect(patrols).toEqual([['merged', merges[1]]]);
    expect(tried).toEqual([merges[1]]);
    // The queue did not wait for the patrol: both merges came first.
    expect(order).toEqual(['delivery.merged', 'delivery.merged', 'patrol.ran']);
  });

  it('patrols no more a full territory after its merges: its queue ran every check on the tree it merged', async () => {
    const { tried, merges, patrols } = await mergedTwice(null);
    expect(merges).toHaveLength(2);
    expect(patrols).toEqual([]);
    expect(tried).toEqual([]);
  });
});
