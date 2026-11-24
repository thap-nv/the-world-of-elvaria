// A red default branch stops its territory taking work (PS-09d), on a real git repo, a bare remote and the fake forge:
// the owner's `patrol` finds main red; the territory's open quests wait, its merge queue stands, the quest that waits
// for its seal goes on; the patrol's draft, once confirmed, is claimed and delivered; its merge moves main, a
// `base_moved` patrol finds it green, and the waiting work goes on. The queue's checks red on a main red on its own open
// no merge quest and wait for it; red on a green main, they open one (PS-09b).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isQueueMerge } from '@elvaria/domain';
import type { Quest, TerritoryId, VerdictId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { CheckRun } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { questPayload, settled, tickUntil } from '../__fixtures__/kingdom.ts';
import { QUEUE_FILES, QUEUE_TERRITORY, sourceWithIndex, statusOf } from '../__fixtures__/queue.ts';
import { createForgeBook } from './book.ts';
import { createPatrolBook, recoverPatrol } from '../patrol/book.ts';
import { createDelegationBook } from '../delegation/book.ts';
import { noticesOf } from '../schedule/digest.ts';
import { loadWorld } from '../tick/world.ts';
import type { Leaves } from '../__fixtures__/deliver.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { Plots, Steward } from '../types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const TERRITORY = 'dc1-se-team' as TerritoryId;
/** Red when state.txt says so, or when a.flag and b.flag meet (a quest and main each green alone). */
const CHECK = [
  "import { existsSync, readFileSync } from 'node:fs';",
  "if (readFileSync('state.txt', 'utf8').trim() === 'red') process.exit(1);",
  "if (existsSync('a.flag') && existsSync('b.flag')) process.exit(1);",
].join('\n');
const FILES = { ...QUEUE_FILES, 'check.mjs': CHECK, 'state.txt': 'green\n' };
const CHECKS = [{ id: 'unit', run: 'node check.mjs', when: ['**'], timeout_minutes: 5 }];
const FOLLOW_UP = { kind: 'fix', rank: 'D', class: 'knight' };

/** Each quest adds its source file; the patrol's fix makes main green; `Flag` adds a.flag. */
const LEAVES: Leaves = (req) => {
  const quest = req.quest;
  if (quest?.created_by === 'patrol' && quest.party_role === undefined) return { 'state.txt': 'green\n' };
  if (quest?.title === 'Flag') return { ...sourceWithIndex('flag.ts'), 'a.flag': 'a\n' };
  if (quest?.title === 'Broken') return { ...sourceWithIndex('broken.ts'), 'state.txt': 'red\n' };
  return sourceWithIndex(`${(quest?.title ?? 'x').toLowerCase()}.ts`);
};

/**
 * The queue's checks as check.mjs runs them, on the merged plot (gitPlots runs none). A session's checks pass: none
 * run, or (`green`) unit green, which the queue's step 4 takes as proof of a combination (CM-06).
 */
const queueCheckOf =
  (green: boolean): Plots['check'] =>
  (request) => {
    const inPlot = (file: string) => path.join(request.plot.path ?? '', file);
    const red =
      request.run_dir.endsWith('-delivery') &&
      (readFileSync(inPlot('state.txt'), 'utf8').trim() === 'red' ||
        (existsSync(inPlot('a.flag')) && existsSync(inPlot('b.flag'))));
    const log = `${request.run_dir}/checks/unit.log`;
    const run = {
      id: 'unit' as CheckRun['id'],
      pass: false,
      duration_ms: 1,
      log_path: log,
      exit_code: 1,
      timed_out: false,
    };
    if (!request.run_dir.endsWith('-delivery')) return Promise.resolve(green ? [{ ...run, pass: true }] : []);
    return Promise.resolve(red ? [run] : []);
  };

async function open(followUp = true, { probe = false, green = false } = {}) {
  const patrol = followUp ? { scans: [], follow_up: FOLLOW_UP } : { scans: [] };
  const bench = await forgeBench({
    delivery: { mode: 'pr_merge' },
    files: FILES,
    territory: { ...QUEUE_TERRITORY, checks: CHECKS, patrol },
    leaves: LEAVES,
  });
  current = bench;
  const plots = { ...gitPlots(bench.kingdom.root, { probe }), check: queueCheckOf(green) };
  return { bench, steward: await bench.start({ plots }), kingdom: bench.kingdom };
}

/** Main on the remote with `file` holding `text`, committed in the territory's repo. */
function pushMain(bench: ForgeBench, text: string, file = 'state.txt'): void {
  git(bench.repo, 'pull', '-q', '--ff-only', 'origin', 'main');
  writeFileSync(path.join(bench.repo, file), `${text}\n`);
  git(bench.repo, 'add', file);
  git(bench.repo, 'commit', '-q', '-m', `main: ${file} ${text}`);
  git(bench.repo, 'push', '-q', 'origin', 'main');
}

/** The owner's `territory patrol --now`, and the patrol run to its end. */
async function patrolNow(bench: ForgeBench, steward: Steward): Promise<void> {
  await bench.kingdom.command('patrol', { territory: TERRITORY });
  await steward.tick();
  await steward.idle();
}

/** Each patrol's trigger, and whether its check passed. */
const triggers = async (bench: ForgeBench) =>
  (await bench.lines('patrol.ran')).map(({ data }) => {
    const [check] = data.checks as readonly { readonly pass: boolean }[];
    return [data.trigger, check?.pass];
  });

/** The red territories and their waiting quests, as the Steward's digest has them from the files and the log. */
async function holdsOf(bench: ForgeBench) {
  const world = await loadWorld(bench.kingdom.store, { warn: () => undefined });
  if (world === undefined) throw new Error('fixture: world');
  const patrol = createPatrolBook();
  recoverPatrol(patrol, (await openEventLog(bench.kingdom.root).read()).events);
  const versions = { asked: new Map(), told: new Map(), holds: [] };
  const books = { forge: createForgeBook(), patrol, delegation: createDelegationBook() };
  return noticesOf(world, {
    reported: new Map(),
    unjudged: new Set(),
    judgeWaits: new Map(),
    versions,
    ...books,
  }).base_holds;
}

const draftOf = async (bench: ForgeBench): Promise<Quest | undefined> =>
  (await bench.kingdom.quests()).find((quest) => quest.created_by === 'patrol' && !isQueueMerge(quest));

/** Ticks a few times, the work outside each tick ended: what was going to move has moved. */
async function quiet(steward: Steward): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await steward.tick();
    await settled(steward);
  }
}

describe('a red default branch (PS-09d)', () => {
  // Real git and real checks through four patrols, three quests and two merges: minutes on a busy machine.
  it('stops the territory until the patrol’s fix makes main green again, then the work goes on', async () => {
    const { bench, steward, kingdom } = await open();
    await kingdom.command('create_quest', questPayload('Alpha', { seal_required: true }));
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Alpha')) === 'awaiting_seal');
    pushMain(bench, 'red');
    await patrolNow(bench, steward);
    expect(await triggers(bench)).toEqual([['owner', false]]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'base_red')).toHaveLength(1);
    const draft = await draftOf(bench);
    expect(draft?.status).toBe('draft');

    // No new quest is claimed there; the sealed quest is done but its queue stands; the owner's --now, still red.
    await kingdom.command('create_quest', questPayload('Later'));
    await kingdom.command('seal', { quest: (await kingdom.quest('Alpha')).id });
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Alpha')) === 'done');
    await patrolNow(bench, steward);
    await quiet(steward);
    const later = await kingdom.quest('Later');
    expect(later.status).toBe('open');
    expect(await bench.lines('delivery.pushed')).toEqual([]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'unclaimable')).toEqual([]);
    expect(await holdsOf(bench)).toEqual([{ territory: TERRITORY, waiting: [later.id] }]);
    expect(await triggers(bench)).toEqual([
      ['owner', false],
      ['owner', false],
    ]);

    // The fix: confirmed, claimed while main is red, sealed, delivered and merged; main moved, a patrol finds it green.
    await kingdom.command('confirm', { quest: draft?.id ?? '' });
    const fixed = async () => (await draftOf(bench))?.status;
    await tickUntil(steward, kingdom.clock, async () => (await fixed()) === 'awaiting_seal');
    await kingdom.command('seal', { quest: draft?.id ?? '' });
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Later')) !== 'open', 200);
    expect((await triggers(bench)).at(-1)).toEqual(['base_moved', true]);
    expect(git(bench.remote, 'show', 'main:state.txt')).toBe('green');
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Alpha')) === 'archived', 200);
    expect(await holdsOf(bench)).toEqual([]);
  }, 600_000);

  // Real git and real checks: a patrol inside the queue's delivery, then one at the owner's word.
  it('keeps a quest whose update is red as main is in the queue, with no merge quest, and delivers it once green', async () => {
    const { bench, steward, kingdom } = await open(false);
    await kingdom.command('create_quest', questPayload('Alpha', { seal_required: true }));
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Alpha')) === 'awaiting_seal');
    pushMain(bench, 'red');
    await kingdom.command('seal', { quest: (await kingdom.quest('Alpha')).id });
    await tickUntil(steward, kingdom.clock, async () => (await triggers(bench)).length > 0);
    await quiet(steward);
    expect(await triggers(bench)).toEqual([['queue', false]]);
    expect(await bench.lines('delivery.failed')).toEqual([]);
    expect((await kingdom.quests()).filter(isQueueMerge)).toEqual([]);

    pushMain(bench, 'green');
    await patrolNow(bench, steward);
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(bench, 'Alpha')) === 'archived', 200);
    expect(await triggers(bench)).toEqual([
      ['queue', false],
      ['owner', true],
    ]);
    expect(await bench.lines('delivery.failed')).toEqual([]);
  }, 600_000);

  // Real git and real checks: the queue's update, then its patrol of main.
  // (CM-06) Step 4 on the quest's own head, a.flag alone: green, the merge of both sides is red (combination); or the
  // session's own run of unit green with the queue's command, proof enough with nothing run.
  it.each([
    ['step 4 finds its own head green', false, [{ pass: true }]],
    ['its session ran unit green', true, []],
  ])(
    'opens the merge quest when the update is red and main green on its own: %s',
    async (_, green, runs) => {
      const { bench, steward, kingdom } = await open(false, { probe: true, green });
      await kingdom.command('create_quest', questPayload('Flag', { seal_required: true }));
      await tickUntil(
        steward,
        kingdom.clock,
        async () => (await statusOf(bench, 'Flag')) === 'awaiting_seal',
      );
      pushMain(bench, 'b', 'b.flag');
      await kingdom.command('seal', { quest: (await kingdom.quest('Flag')).id });
      await tickUntil(steward, kingdom.clock, async () => (await bench.lines('delivery.failed')).length > 0);
      const [failed] = await bench.lines('delivery.failed');
      const [merge] = (await kingdom.quests()).filter(isQueueMerge);
      expect(failed?.data).toMatchObject({ stage: 'update', reason: 'checks_red', merge_quest: merge?.id });
      expect(await triggers(bench)).toEqual([['queue', true]]);
      const [attributed] = await bench.lines('check.attributed');
      expect(attributed?.data).toMatchObject({ source: 'queue', cause: 'combination', runs });
    },
    300_000,
  );

  // Real git and real checks: the queue's update, its patrol of main, step 4 on the quest's own head.
  it('fails the quest late when step 4 finds its own head red: back to its doer, its judge judged, no merge quest', async () => {
    const { bench, steward, kingdom } = await open(false, { probe: true });
    await kingdom.command('create_quest', questPayload('Broken', { seal_required: true }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(bench, 'Broken')) === 'awaiting_seal',
    );
    pushMain(bench, 'c', 'c.txt');
    const { id } = await kingdom.quest('Broken');
    await kingdom.command('seal', { quest: id });
    const late = `${id}-1-late` as VerdictId;
    const failedLate = async () =>
      (await bench.lines('verdict.fail')).some(({ data }) => data.verdict === late);
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await failedLate()) && (await statusOf(bench, 'Broken')) !== 'done',
    );
    const [attributed] = await bench.lines('check.attributed');
    expect(attributed?.data).toMatchObject({
      source: 'queue',
      cause: 'own_change',
      culprit: id,
      runs: [{ quest: id, pass: false }],
    });
    const pass = await kingdom.store.verdicts.read(`${id}-1` as VerdictId);
    const judge = pass.ok ? pass.value.verifier_id : '';
    const entries = (await kingdom.character(judge)).reputation.window.filter(
      ({ verdict_id: v }) => v === late,
    );
    expect(entries.map(({ result }) => result)).toEqual(['fail']);
    expect((await kingdom.quests()).filter(isQueueMerge)).toEqual([]);
    expect(await bench.lines('delivery.failed')).toEqual([]);
    expect(git(bench.remote, 'show', 'main:state.txt')).toBe('green');
  }, 300_000);
});
