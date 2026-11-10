// The run's next judge reuses the machine checks (P1-38, P1-35 (c); implementation-plan §3.1 "(P1-25)"): checks that
// ran on a commit still at the quest's branch head serve every judge of the run, so a judge that reads in part (or
// one a breaker stopped) costs no second run of a ten-minute e2e. A branch head that moved, a plot without git, and a
// judge in a scratch plot, whose plot leaves with it (ADR 0022), get their own run as before (P1-04).
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { worktreePlots } from './__fixtures__/deliver.ts';
import { PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs, verdictIn } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';
import type { Quest } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { CheckRun } from '@elvaria/runner-core';

const opened: { kingdom: Bench; steward: Steward }[] = [];

afterEach(async () => {
  for (const { kingdom, steward } of opened.splice(0)) {
    await steward.stop();
    await kingdom.remove();
  }
});

/** The first judge reads in part, the next one judges: two judges of run 1. */
const PARTIAL = { result: 'partial', progress: { checked_until: 'src/api/orders.ts' } };

/** The unit check of run 1 of the quest whose run folder is `runDir`, green after ten minutes. */
const unitPasses = (runDir: string): CheckRun => ({
  id: 'unit' as CheckRun['id'],
  pass: true,
  duration_ms: 600_000,
  log_path: `.runs/${questOfRun(runDir)}-1/checks/unit.log`,
  exit_code: 0,
  timed_out: false,
});

const greenChecks: Plots['check'] = ({ run_dir: runDir }) => Promise.resolve([unitPasses(runDir)]);

interface Setup {
  /** What the plot's head answers each time it is asked, the last one from then on. */
  readonly heads?: readonly (string | null)[];
  /** The plot's head, in place of `heads`. */
  readonly head?: Plots['head'];
  readonly tags?: readonly string[];
  /** More answers of the plots, made once the kingdom's folder exists; `head` stays the spec's. */
  readonly plots?: (root: string) => Partial<Plots>;
  /** What the run's judges hand in, in turn: by default a partial verdict, then a pass. */
  readonly verdicts?: readonly unknown[];
  /** The status the quest ends in: done by default. */
  readonly until?: Quest['status'];
}

/** A quest judged by the judges of run 1 (by default two, the first reading in part); every plot call kept. */
async function judgedBy(title: string, setup: Setup) {
  const verdicts = setup.verdicts ?? [PARTIAL, PASS];
  const kingdom = await bench({ plays: { verdicts: { [title]: verdicts } } });
  const calls: string[] = [];
  const heads = setup.heads ?? [null];
  let asked = 0;
  const inTurn: Plots['head'] = () => Promise.resolve(heads[Math.min(asked++, heads.length - 1)] ?? null);
  const replace = { check: greenChecks, ...setup.plots?.(kingdom.root), head: setup.head ?? inTurn };
  const steward = kingdom.steward({ plots: plotsWith(kingdom.root, replace, calls) });
  opened.push({ kingdom, steward });
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  const fields = setup.tags === undefined ? {} : { tags: setup.tags };
  await kingdom.command('create_quest', questPayload(title, fields));
  await tickUntil(steward, kingdom.clock, statusIs(kingdom, title, setup.until ?? 'done'));
  const quest = await kingdom.quest(title);
  const judges = quest.attempt_log.filter(({ role }) => role === 'verifier');
  return { kingdom, steward, quest, calls, judges: judges.map(({ outcome }) => outcome) };
}

/** Two judges of run 1, the first reading in part, the quest done. */
async function twoJudges(title: string, setup: Setup) {
  const judged = await judgedBy(title, setup);
  expect(judged.judges).toEqual(['partial', 'submitted']);
  return judged;
}

const runsOf = (calls: readonly string[], what: 'check' | 'trial' | 'prepare scratch') =>
  calls.filter((call) => call.startsWith(`${what} `));

/** The unit check, green, as the trial of a scratch plot gives it. */
const greenTrial: Plots['trial'] = ({ run_dir: runDir }) => Promise.resolve([unitPasses(runDir)]);

/** A worktree plot, so the ritual of an e2e quest judges in a scratch plot (ADR 0022); `more` over it. */
const scratchPlots =
  (more: Partial<Plots> = {}) =>
  (root: string): Partial<Plots> => ({
    ...worktreePlots(path.join(root, 'repo')),
    trial: greenTrial,
    ...more,
  });

describe("the run's next judge and the machine checks (P1-38)", () => {
  it('runs them once for two judges while the branch head stays on the commit they ran on', async () => {
    const { kingdom, quest, calls } = await twoJudges('Read in two sittings', { heads: ['f00d'] });
    expect(runsOf(calls, 'check')).toEqual([`check .runs/${quest.id}-1`]);
    // The second judge got the same results: in its verdict, and in quest.checks_run.
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({
      result: 'pass',
      checks: [{ id: 'unit', pass: true }],
    });
    expect(quest.checks_run).toEqual(['unit']);
    expect(kingdom.warnings.filter((line) => line.includes('checks_stale'))).toEqual([]);
  });

  it('runs them again for the next judge once the branch head moved', async () => {
    // Read before the checks, at the first judge, then at the second: the owner committed in between.
    const { kingdom, quest, calls } = await twoJudges('Committed meanwhile', {
      heads: ['f00d', 'f00d', 'beef'],
    });
    expect(runsOf(calls, 'check')).toEqual([`check .runs/${quest.id}-1`, `check .runs/${quest.id}-1`]);
    expect(kingdom.warnings).toContainEqual(expect.stringContaining('checks_stale'));
  });

  it('runs them again for each judge of a plot without git, or one whose head git cannot read', async () => {
    const plain = await twoJudges('No git', {});
    expect(runsOf(plain.calls, 'check')).toHaveLength(2);
    const broken: Plots['head'] = () => Promise.reject(new Error('git is not found'));
    const unread = await twoJudges('Git gone', { head: broken });
    expect(runsOf(unread.calls, 'check')).toHaveLength(2);
    expect(unread.kingdom.warnings).toContainEqual(
      expect.stringContaining('the head of its plot is unknown: git is not found'),
    );
  });
});

// The run's next judge in a scratch plot (P1-42, P1-38 (a)): its own scratch plot, made after commands.setup, and the
// last judge's trial while the branch head stays; half an hour of e2e at P1-35 otherwise.
describe("the run's next judge in a scratch plot and the trial (P1-42)", () => {
  it('makes it a fresh scratch plot without running the trial again while the branch head stays', async () => {
    const { kingdom, quest, calls } = await twoJudges('Wall tried once', {
      heads: ['f00d'],
      tags: ['e2e'],
      plots: scratchPlots(),
    });
    expect(runsOf(calls, 'trial')).toEqual([`trial .runs/${quest.id}-1 x3 coverage`]);
    expect(runsOf(calls, 'prepare scratch')).toEqual([`prepare scratch ${quest.id}`]);
    expect(runsOf(calls, 'check')).toEqual([]);
    // Each judge's scratch plot left with it; the second judge's verdict has the trial's results.
    expect(calls.filter((call) => call.startsWith('release scratch'))).toHaveLength(2);
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({ checks: [{ id: 'unit', pass: true }] });
    // One check.start and one check.end: the trial ran once.
    const lines = (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);
    expect(lines.filter((type) => type.startsWith('check.'))).toEqual(['check.start', 'check.end']);
  });

  it('runs the trial again for the next judge once the branch head moved', async () => {
    // Read before the trial, at the first judge, then before the second judge's plot: the owner committed.
    const { kingdom, quest, calls } = await twoJudges('Wall moved', {
      heads: ['f00d', 'f00d', 'beef'],
      tags: ['e2e'],
      plots: scratchPlots(),
    });
    expect(runsOf(calls, 'trial')).toEqual([
      `trial .runs/${quest.id}-1 x3 coverage`,
      `trial .runs/${quest.id}-1 x3 coverage`,
    ]);
    expect(runsOf(calls, 'prepare scratch')).toEqual([]);
    expect(kingdom.warnings).toContainEqual(expect.stringContaining('its branch moved since the last trial'));
  });

  it('runs the trial again when the fresh scratch plot cannot be made, and says why', async () => {
    const refused = () => Promise.reject(new Error('setup_failed: exit 1'));
    const { kingdom, calls } = await twoJudges('Wall unbuilt', {
      heads: ['f00d'],
      tags: ['e2e'],
      plots: scratchPlots({ prepareScratch: refused }),
    });
    expect(runsOf(calls, 'trial')).toHaveLength(2);
    expect(kingdom.warnings).toContainEqual(
      expect.stringContaining('no scratch plot without the trial: setup_failed: exit 1'),
    );
  });

  it('stops at the third partial verdict in a scratch plot, with one trial and no fourth judge (P1-42)', async () => {
    const stopped = { result: 'partial', progress: { checked_until: 'break_and_expect_red' } };
    const { steward, kingdom, quest, calls, judges } = await judgedBy('Wall of echoes', {
      heads: ['f00d'],
      tags: ['e2e'],
      plots: scratchPlots(),
      verdicts: [stopped, stopped, stopped, PASS],
      until: 'infirmary',
    });
    expect(judges).toEqual(['partial', 'partial', 'partial']);
    expect(runsOf(calls, 'trial')).toHaveLength(1);
    expect(runsOf(calls, 'prepare scratch')).toHaveLength(2);
    expect(kingdom.notices.at(-1)).toMatchObject({
      trip: 'partial_verdicts',
      detail: { partial_verdicts: 3 },
    });
    for (let tick = 0; tick < 3; tick += 1) {
      kingdom.clock.advance(1);
      await steward.tick();
    }
    expect(
      (await kingdom.quest(quest.title)).attempt_log.filter(({ role }) => role === 'verifier'),
    ).toHaveLength(3);
    expect(runsOf(calls, 'prepare scratch')).toHaveLength(2);
  });
});
