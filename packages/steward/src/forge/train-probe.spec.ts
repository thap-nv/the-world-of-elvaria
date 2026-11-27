// The probe of a red delivery train (CM-08b, ADR 0032, ADR 0033) on the forge bench, real git and a real check. The
// quest found fails late (its own change) or goes to a merge quest (a combination); the quests merged before it leave
// at once as a `split` train; those after it wait on the platform; one that conflicts with main leaves for a merge
// quest. The base branch red on its own blames nobody. A Steward stopped mid-probe writes no line. With no probe to run,
// each red ride sends its quests back, the third fails them to the owner, and the owner's `deliver` naming the
// territory forgets those failures (623).
import { isQueueMerge } from '@elvaria/domain';
import type { VerdictId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { tickUntil } from '../__fixtures__/kingdom.ts';
import { sealedTogether, statusOf } from '../__fixtures__/queue.ts';
import { pushToMain, ranOf, trainBenchOf, trainBranchesOf } from '../__fixtures__/train.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { TrainBenchOptions } from '../__fixtures__/train.ts';
import type { Plots } from '../types.ts';

// Real git and a real check: up to four trains a case, each built and tried in its plot, and the probe's runs.
const SLOW = 300_000;

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

/** The bench and its Steward, with the probe's plots unless `probe` is false; `plots` over them. */
async function open(
  options: TrainBenchOptions,
  probe = true,
  plots: (base: Plots) => Partial<Plots> = () => ({}),
) {
  const bench = await trainBenchOf(options);
  current = bench;
  const base = gitPlots(bench.kingdom.root, { probe });
  const steward = await bench.start({ plots: { ...base, ...plots(base) } });
  return { bench, steward, kingdom: bench.kingdom };
}

const dataOf = async (bench: ForgeBench, type: string) => (await bench.lines(type)).map(({ data }) => data);
const idsOf = (bench: ForgeBench, titles: readonly string[]) =>
  Promise.all(titles.map(async (title) => (await bench.kingdom.quest(title)).id));
const questsOf = (line: Record<string, unknown> | undefined) =>
  (line?.steps as { quest: string }[] | undefined)?.map(({ quest }) => quest);
const failedOf = async (bench: ForgeBench) =>
  (await dataOf(bench, 'delivery.failed')).map(({ quest, stage, reason }) => [quest, stage, reason]);

describe('the probe of a red delivery train (CM-08b)', () => {
  it(
    'fails the quest found late, sends those before it off as a split train, keeps those after it',
    async () => {
      const { bench, steward, kingdom } = await open({ max_quests: 4 });
      await sealedTogether(bench, steward, ['Clash', 'Alpha', 'Red', 'Beta']);
      await pushToMain(bench, 'README.md', '# moved\n');
      await tickUntil(steward, kingdom.clock, async () => (await ranOf(bench)).length >= 2, 300);
      const [clash, alpha, red, beta] = await idsOf(bench, ['Clash', 'Alpha', 'Red', 'Beta']);
      const [first, split] = await ranOf(bench);
      expect(first).toMatchObject({ outcome: 'red', departure: 'full', checks: [{ id: 'state' }] });
      expect(first?.left).toEqual([{ quest: clash, reason: 'conflict' }]);
      expect(questsOf(first)).toEqual([alpha, red, beta]);
      expect(split).toMatchObject({ outcome: 'green', departure: 'split', pr: 1 });
      expect(questsOf(split)).toEqual([alpha]);
      const [attributed, ...more] = await dataOf(bench, 'check.attributed');
      expect(more).toEqual([]);
      expect(attributed).toMatchObject({
        source: 'train',
        cause: 'own_change',
        culprit: red,
        checks: ['state'],
      });
      const late = `${red ?? ''}-1-late` as VerdictId;
      expect((await kingdom.store.verdicts.read(late)).ok).toBe(true);
      expect((await dataOf(bench, 'verdict.fail')).map(({ verdict }) => verdict)).toContain(late);
      expect(await statusOf(bench, 'Red')).not.toBe('done');
      expect(await failedOf(bench)).toEqual([[clash, 'train', 'conflict']]);
      const merged = await dataOf(bench, 'delivery.merged');
      expect(merged.map(({ quest, train }) => [quest, train])).toEqual([[alpha, split?.train]]);
      expect(await statusOf(bench, 'Beta')).toBe('done');
      expect(merged.map(({ quest }) => quest)).not.toContain(beta);
      expect(trainBranchesOf(bench)).toBe('');
    },
    SLOW,
  );

  it(
    'sends the quest found to a merge quest when only its combination with the train is red',
    async () => {
      const { bench, steward, kingdom } = await open({ max_quests: 2 });
      await sealedTogether(bench, steward, ['Alpha', 'Combo']);
      await tickUntil(steward, kingdom.clock, async () => (await ranOf(bench)).length >= 2, 300);
      const [alpha, combo] = await idsOf(bench, ['Alpha', 'Combo']);
      const [first, split] = await ranOf(bench);
      expect(first).toMatchObject({ outcome: 'red', departure: 'full' });
      expect(split).toMatchObject({ outcome: 'green', departure: 'split' });
      expect(questsOf(split)).toEqual([alpha]);
      const [attributed] = await dataOf(bench, 'check.attributed');
      expect(attributed).toMatchObject({ source: 'train', cause: 'combination', culprit: combo });
      const [merge] = (await kingdom.quests()).filter(isQueueMerge);
      expect(await failedOf(bench)).toEqual([[combo, 'train', 'checks_red']]);
      const [failed] = await dataOf(bench, 'delivery.failed');
      expect(failed).toMatchObject({ train: first?.train, merge_quest: merge?.id });
      expect(merge?.parent_id).toBe(combo);
      expect(await dataOf(bench, 'verdict.fail')).toEqual([]);
    },
    SLOW,
  );

  it(
    'blames nobody when the base branch is red on its own',
    async () => {
      const { bench, steward, kingdom } = await open({ max_quests: 2, patrolled: true });
      await sealedTogether(bench, steward, ['Alpha', 'Beta']);
      await pushToMain(bench, 'red.txt', 'red\n');
      await tickUntil(steward, kingdom.clock, async () => (await ranOf(bench)).length === 1, 300);
      const [first] = await ranOf(bench);
      expect(first).toMatchObject({ outcome: 'red', departure: 'full', base_red: true });
      const sources = (await dataOf(bench, 'check.attributed')).map(({ source }) => source);
      expect(sources).not.toContain('train');
      expect(await failedOf(bench)).toEqual([]);
      expect([await statusOf(bench, 'Alpha'), await statusOf(bench, 'Beta')]).toEqual(['done', 'done']);
    },
    SLOW,
  );

  it(
    'writes no line and leaves no plot when the Steward stops mid-probe',
    async () => {
      let stopping: Promise<void> | undefined;
      const { bench, steward, kingdom } = await open({ max_quests: 2 }, true, (base) => ({
        probe: (territory, commit, checks, signal) => {
          stopping ??= steward.stop();
          if (base.probe === undefined) throw new Error('fixture: no probe plots');
          return base.probe(territory, commit, checks, signal);
        },
      }));
      await sealedTogether(bench, steward, ['Alpha', 'Red']);
      await tickUntil(steward, kingdom.clock, () => Promise.resolve(stopping !== undefined), 300);
      await stopping;
      expect(await ranOf(bench)).toEqual([]);
      expect(await bench.lines('check.attributed')).toEqual([]);
      expect(await failedOf(bench)).toEqual([]);
      expect(await bench.lines('verdict.fail')).toEqual([]);
      expect(trainBranchesOf(bench)).toBe('');
      expect(git(bench.repo, 'worktree', 'list')).not.toMatch(/train-|probe-/);
    },
    SLOW,
  );

  it(
    'fails each quest of its third red ride to the owner, whose deliver lets them board again (623)',
    async () => {
      const { bench, steward, kingdom } = await open({ max_quests: 2 }, false);
      await sealedTogether(bench, steward, ['Alpha', 'Red']);
      await tickUntil(steward, kingdom.clock, async () => (await ranOf(bench)).length === 3, 300);
      const [alpha, red] = await idsOf(bench, ['Alpha', 'Red']);
      await tickUntil(steward, kingdom.clock, async () => (await failedOf(bench)).length === 2, 50);
      expect(await failedOf(bench)).toEqual([
        [alpha, 'train', 'checks_red'],
        [red, 'train', 'checks_red'],
      ]);
      const causes = (await dataOf(bench, 'check.attributed')).map(({ cause }) => cause);
      expect(causes).toEqual(['unknown', 'unknown', 'unknown']);
      await kingdom.command('deliver', { territory: 'dc1-se-team' });
      await tickUntil(steward, kingdom.clock, async () => (await ranOf(bench)).length >= 4, 300);
      const rides = (await ranOf(bench)).map(({ departure, outcome }) => [departure, outcome]);
      expect(rides.slice(0, 4)).toEqual([
        ['full', 'red'],
        ['full', 'red'],
        ['full', 'red'],
        ['owner', 'red'],
      ]);
      expect(await failedOf(bench)).toHaveLength(2);
    },
    SLOW,
  );
});
