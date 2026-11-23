// The merge queue's checks by the territory's check mode (CM-01, ADR 0032) on the forge bench: once main moved under a
// sealed quest, a narrow territory runs the checks the quest's own diff since the new main selects, narrowly, and
// says so on its `check.*` lines; a territory that names no policy runs every check as a merge quest, as before.
import { afterEach, describe, expect, it } from 'vitest';

import { gitPlots } from '../__fixtures__/git-plots.ts';
import { tickUntil } from '../__fixtures__/kingdom.ts';
import { queueBench, sealedTogether, sourceWithIndex, titlesOf } from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { PlotCheck } from '../plot/plot.ts';
import type { Plots } from '../types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const CHECKS = [
  {
    id: 'unit',
    run: 'pnpm -r test',
    narrow: 'pnpm test:changed',
    when: ['src/**', 'docs/**'],
    timeout_minutes: 5,
  },
];

/** Alpha and Beta sealed together, Beta's branch updated once Alpha's merge moved main; the queue's check requests. */
async function queued(policy: Readonly<Record<string, unknown>> | null) {
  const leaves = { Alpha: sourceWithIndex('alpha.ts'), Beta: sourceWithIndex('beta.ts') };
  const territory = { checks: CHECKS, ...(policy === null ? {} : { check_policy: policy }) };
  const { bench, steward: first } = await queueBench(leaves, { territory });
  current = bench;
  await first.stop();
  const asked: PlotCheck[] = [];
  const check: Plots['check'] = (request) => {
    if (request.run_dir.endsWith('-delivery')) asked.push(request);
    return Promise.resolve([]);
  };
  const steward = await bench.start({ plots: { ...gitPlots(bench.kingdom.root), check } });
  await sealedTogether(bench, steward, ['Alpha', 'Beta']);
  const merged = async () => (await titlesOf(bench, 'delivery.merged')).length === 2;
  await tickUntil(steward, bench.kingdom.clock, merged, 200);
  const starts = (await bench.lines('check.start')).filter(({ data }) => data.delivery === true);
  return { asked, starts: starts.map(({ data }) => data) };
}

describe("the merge queue's checks by check mode (CM-01)", () => {
  it("run narrowly on the quest's diff since the new main, not as a merge quest, and say so", async () => {
    const { asked, starts } = await queued({ mode: 'narrow' });
    expect(asked.map(({ mode, party_role: role }) => [mode, role])).toEqual([['narrow', undefined]]);
    expect(starts).toEqual([{ delivery: true, mode: 'narrow' }]);
  });

  it('run every check as a merge quest on a territory that names no policy, as before CM-01', async () => {
    const { asked, starts } = await queued(null);
    expect(asked.map(({ mode, party_role: role }) => [mode, role])).toEqual([[undefined, 'merge']]);
    expect(starts).toEqual([{ delivery: true }]);
  });
});
