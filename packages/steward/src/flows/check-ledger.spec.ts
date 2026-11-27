// The check ledger wired in (RC-04, ADR 0035, plans/recheck.md §2.2) on the forge bench: real git, a fake forge, checks
// and patrols that record what they ran and carried. A quest checked in full then merged: the patrol after the merge
// carries every check and makes no plot, even under a Steward started anew since the checks ran; the owner's patrol
// runs them all. A narrow run before: the patrol runs the checks that have a narrow command, carries the others. The
// queue's red check runs once more on the same tree, the green ones carried: green then, `flaky`, and the delivery goes on.
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { settled, tickUntil } from '../__fixtures__/kingdom.ts';
import { ledgerCheck, ledgerPatrol } from '../__fixtures__/ledger.ts';
import { queueBench, sealedTogether, sourceWithIndex, titlesOf } from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { RedOf } from '../__fixtures__/ledger.ts';
import type { Steward } from '../types.ts';

const TERRITORY = 'dc1-se-team';
const CHECKS = [
  {
    id: 'unit',
    run: 'node unit.mjs',
    narrow: 'node unit.mjs --changed',
    when: ['src/**'],
    timeout_minutes: 5,
  },
  { id: 'lint', run: 'node lint.mjs', when: ['**'], timeout_minutes: 5 },
];
/** Narrow, but a quest that touches src/ is checked in full: every check, its `run`. */
const FULL_ON_SRC = { mode: 'narrow', full_when: ['src/**'] };

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

/** Ticks a few times, the work outside each tick ended: a patrol due after a merge has run. */
async function quiet(steward: Steward): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await steward.tick();
    await settled(steward);
  }
}

/** The bench of a patrolled territory with CHECKS under `policy`, its Plots recording; `start` gives a Steward. */
async function ledgerBench(
  titles: readonly string[],
  policy: Readonly<Record<string, unknown>>,
  red?: RedOf,
) {
  const leaves = Object.fromEntries(
    titles.map((title) => [title, sourceWithIndex(`${title.toLowerCase()}.ts`)]),
  );
  const territory = {
    checks: CHECKS,
    patrol: { scans: [], after_merge: { every: 1 } },
    check_policy: policy,
  };
  const { bench, steward: first } = await queueBench(leaves, { territory });
  current = bench;
  await first.stop();
  const checks = ledgerCheck(red);
  const patrols = ledgerPatrol(() => git(bench.remote, 'rev-parse', 'main'));
  const plots = {
    ...gitPlots(bench.kingdom.root, { ledger: true }),
    check: checks.check,
    patrol: patrols.patrol,
  };
  return { bench, checks, patrols, start: () => bench.start({ plots }) };
}

const merged = (bench: ForgeBench, count: number) => async () =>
  (await titlesOf(bench, 'delivery.merged')).length === count;

/** The id of the line of the run after Alpha's session, which the patrol's carried checks name. */
async function sessionLine(bench: ForgeBench): Promise<string> {
  const ends = (await bench.lines('check.end')).filter(({ data }) => data.delivery !== true);
  expect(ends).toHaveLength(1);
  return ends[0]?.id ?? '';
}

/** What each patrol said of each check: [trigger, head, [id, pass, carried_from]]. */
const patrolsOf = async (bench: ForgeBench) =>
  (await bench.lines('patrol.ran')).map(({ data }) => [
    data.trigger,
    data.head,
    (data.checks as { id: string; pass: boolean; carried_from?: string }[]).map((check) => [
      check.id,
      check.pass,
      check.carried_from,
    ]),
  ]);

describe('the check ledger wired in (RC-04)', () => {
  it('carries every check of a run in full to the patrol after the merge, no plot, a restart between', async () => {
    const { bench, patrols, start } = await ledgerBench(['Alpha'], FULL_ON_SRC);
    // The pull request waits on the forge's checks while the Steward is started anew.
    bench.forge.answer({ state: 'pending' });
    const steward = await start();
    await sealedTogether(bench, steward, ['Alpha']);
    const pushed = async () => (await titlesOf(bench, 'delivery.pushed')).length === 1;
    await tickUntil(steward, bench.kingdom.clock, pushed, 200);
    await steward.stop();
    const again = await start();
    bench.forge.answer({ state: 'green' });
    await tickUntil(again, bench.kingdom.clock, merged(bench, 1), 200);
    await quiet(again);
    const head = git(bench.remote, 'rev-parse', 'main');
    const line = await sessionLine(bench);
    // The merge's tree is the one the session's run checked: nothing to run, no plot made.
    expect(patrols.calls).toEqual([]);
    const carried = [
      ['unit', true, line],
      ['lint', true, line],
    ];
    expect(await patrolsOf(bench)).toEqual([['merged', head, carried]]);
    const [ran] = await bench.lines('patrol.ran');
    expect(ran?.data).toMatchObject({ setup: null, tree: git(bench.remote, 'rev-parse', 'main^{tree}') });

    // The owner's patrol runs every check whatever the ledger holds (K4).
    await bench.kingdom.command('patrol', { territory: TERRITORY });
    await quiet(again);
    expect(patrols.calls).toEqual([{ commit: head, ran: ['unit', 'lint'], carried: [] }]);
    expect((await patrolsOf(bench))[1]).toEqual([
      'owner',
      head,
      [
        ['unit', true, undefined],
        ['lint', true, undefined],
      ],
    ]);
  });

  it('runs at the patrol the checks a narrow run ran by their narrow command, and carries the others', async () => {
    const { bench, patrols, start } = await ledgerBench(['Alpha'], { mode: 'narrow' });
    const steward = await start();
    await sealedTogether(bench, steward, ['Alpha']);
    await tickUntil(steward, bench.kingdom.clock, merged(bench, 1), 200);
    await quiet(steward);
    const [end] = (await bench.lines('check.end')).filter(({ data }) => data.delivery !== true);
    expect(end?.data).toMatchObject({ mode: 'narrow', base: expect.any(String) as string });
    const head = git(bench.remote, 'rev-parse', 'main');
    expect(patrols.calls).toEqual([{ commit: head, ran: ['unit'], carried: ['lint'] }]);
    expect((await patrolsOf(bench))[0]?.[2]).toEqual([
      ['unit', true, undefined],
      ['lint', true, end?.id],
    ]);
  });

  it("runs the queue's red check once more, the green ones carried: green then, flaky, and Beta is merged", async () => {
    const reddened = new Set<string>();
    // Beta's first run in the queue is red on unit; any other run is green.
    const red: RedOf = (id, runDir) => {
      if (id !== 'unit' || !runDir.endsWith('-delivery') || reddened.has(runDir)) return false;
      reddened.add(runDir);
      return true;
    };
    const { bench, checks, start } = await ledgerBench(['Alpha', 'Beta'], FULL_ON_SRC, red);
    const steward = await start();
    await sealedTogether(bench, steward, ['Alpha', 'Beta']);
    await tickUntil(steward, bench.kingdom.clock, merged(bench, 2), 200);
    const beta = (await bench.kingdom.quest('Beta')).id;
    const queue = checks.calls.filter(({ run_dir: dir }) => dir === `.runs/${beta}-delivery`);
    expect(queue.map(({ ran, carried }) => ({ ran, carried }))).toEqual([
      { ran: ['unit', 'lint'], carried: [] },
      { ran: ['unit'], carried: ['lint'] },
    ]);
    const attributed = (await bench.lines('check.attributed')).map(({ quest, data }) => ({ quest, ...data }));
    expect(attributed).toEqual([
      expect.objectContaining({ quest: beta, source: 'queue', cause: 'flaky', checks: ['unit'] }),
    ]);
    expect(await bench.lines('delivery.failed')).toEqual([]);
  });
});
