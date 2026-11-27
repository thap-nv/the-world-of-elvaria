// (CM-03, (613)) Merge batches wait for three deliveries, quiet paths wait for the schedule, and every: 1 keeps
// the original queue behaviour. The queue never waits for the merged patrol.
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
async function mergedBatch(
  policy: Readonly<Record<string, unknown>> | null,
  options: { every?: number; third?: boolean; quiet?: boolean } = {},
) {
  const leaves = {
    Alpha: options.quiet === true ? { 'docs/alpha.md': 'alpha\n' } : sourceWithIndex('alpha.ts'),
    Beta: options.quiet === true ? { 'docs/beta.md': 'beta\n' } : sourceWithIndex('beta.ts'),
    Gamma: options.quiet === true ? { 'docs/gamma.md': 'gamma\n' } : sourceWithIndex('gamma.ts'),
    Delta: { 'src/a.ts': 'changed\n' },
  };
  const territory = {
    checks: CHECKS,
    patrol: {
      scans: [],
      after_merge: {
        ...(options.every === undefined ? {} : { every: options.every }),
        quiet_paths: options.quiet === true ? ['docs/**'] : [],
      },
    },
    ...(policy === null ? {} : { check_policy: policy }),
  };
  const { bench, steward: first } = await queueBench(leaves, { territory });
  current = bench;
  await first.stop();
  const tried: string[] = [];
  const info: string[] = [];
  // The patrol tries the head of the remote's main as a fetch finds it, green; the quests' checks pass.
  const patrol: Plots['patrol'] = () => {
    const base = git(bench.remote, 'rev-parse', 'main');
    tried.push(base);
    const trial: TerritoryTrial = { base, setup: null, checks: [] };
    return Promise.resolve(trial);
  };
  const check: Plots['check'] = () => Promise.resolve([]);
  const steward = await bench.start({
    plots: { ...gitPlots(bench.kingdom.root), check, patrol },
    log: { warn: () => undefined, info: (message) => void info.push(message) },
  });
  if (options.quiet === true) {
    await bench.kingdom.command('patrol', { territory: 'dc1-se-team' });
    await quiet(steward);
    tried.length = 0;
  }
  await sealedTogether(bench, steward, ['Alpha', 'Beta']);
  const merged = async () => (await titlesOf(bench, 'delivery.merged')).length === 2;
  await tickUntil(steward, bench.kingdom.clock, merged, 200);
  await quiet(steward);
  const afterTwo = (await bench.lines('patrol.ran')).filter(({ data }) => data.trigger === 'merged');
  if (options.third === true || options.quiet === true) {
    expect(afterTwo).toEqual([]);
    await sealedTogether(bench, steward, ['Gamma']);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await titlesOf(bench, 'delivery.merged')).length === 3,
      200,
    );
    await quiet(steward);
  }
  if (options.quiet === true) {
    expect((await bench.lines('patrol.ran')).map(({ data }) => data.trigger)).toEqual(['owner']);
    expect(tried).toEqual([]);
    expect(info).toHaveLength(1);
    expect(info[0]).toContain('dc1-se-team from ');
    expect(info[0]).toContain('only quiet_paths');
    await sealedTogether(bench, steward, ['Delta']);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await titlesOf(bench, 'delivery.merged')).length === 4,
      200,
    );
    await quiet(steward);
  }
  const merges = (await bench.lines('delivery.merged')).map(({ data }) => data.merge_sha);
  const patrols = (await bench.lines('patrol.ran'))
    .filter(({ data }) => data.trigger === 'merged')
    .map(({ data }) => [data.trigger, data.head]);
  const order = (await openEventLog(bench.kingdom.root).read()).events
    .filter(({ type }) => type === 'delivery.merged' || type === 'patrol.ran')
    .map(({ type }) => type);
  return { tried, merges, patrols, order };
}

describe('the patrol after a merge (CM-03)', () => {
  it('waits after two merges and patrols once at the third head by default', async () => {
    const { tried, merges, patrols } = await mergedBatch({ mode: 'narrow' }, { third: true });
    expect(merges).toHaveLength(3);
    expect(patrols).toEqual([['merged', merges[2]]]);
    expect(tried).toEqual([merges[2]]);
  });

  it('keeps the original behaviour with every: 1', async () => {
    const { tried, merges, patrols, order } = await mergedBatch({ mode: 'narrow' }, { every: 1 });
    expect(merges).toHaveLength(2);
    expect(patrols).toEqual([['merged', merges[1]]]);
    expect(tried).toEqual([merges[1]]);
    // The queue did not wait for the patrol: both merges came first.
    expect(order).toEqual(['delivery.merged', 'delivery.merged', 'patrol.ran']);
  });

  it('patrols no more a full territory after its merges: its queue ran every check on the tree it merged', async () => {
    const { tried, merges, patrols } = await mergedBatch(null);
    expect(merges).toHaveLength(2);
    expect(patrols).toEqual([]);
    expect(tried).toEqual([]);
  });

  it('skips three docs-only merges, then patrols the next source change at its head', async () => {
    const { tried, merges, patrols } = await mergedBatch({ mode: 'narrow' }, { quiet: true });
    expect(merges).toHaveLength(4);
    expect(patrols).toEqual([['merged', merges[3]]]);
    expect(tried).toEqual([merges[3]]);
  });
});
