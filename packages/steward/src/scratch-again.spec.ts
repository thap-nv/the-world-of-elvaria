// The run's next judge in a scratch plot, on real git (implementation-plan §3.15; P1-42, P1-38 (a)): the first judge
// reads in part and leaves, its scratch plot removed with it; the second gets a scratch plot of its own, made again
// at the head of the quest's branch after commands.setup, and the first judge's trial, which does not run again.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { scratchIdOf } from '@elvaria/runner-core';
import type { AgentRunner, FakeRunner, SpawnRequest } from '@elvaria/runner-core';
import { fromPortable, pathExists } from '@elvaria/store';
import { afterEach, expect, it } from 'vitest';

import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs, verdictIn } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: string[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, RM_TEMP)));
  running = undefined;
  current = undefined;
});

const TEST = "import { sum } from '../src/sum.mjs';\nif (sum(2, 3) !== 5) process.exit(1);\n";
const E2E = { id: 'e2e', run: 'node e2e/sum.test.mjs', when: ['e2e/**'], timeout_minutes: 1 };
const BREAKS = [
  { change: 'src/sum.mjs:1 a + b -> a - b', red: 'node e2e/sum.test.mjs: exit 1' },
  { change: 'src/sum.mjs:1 a + b -> a * b', red: 'node e2e/sum.test.mjs: exit 1' },
];
/** The first judge stops before breaking anything; the second breaks twice and passes. */
const VERDICTS = [
  { result: 'partial', notes: 'Read the test.', progress: { checked_until: 'break_and_expect_red' } },
  { result: 'pass', notes: 'Both breaks turned the test red.', breaks: BREAKS },
];

interface Seen {
  readonly cwd: string;
  readonly head: string;
  /** The assignee's test is there: the plot stands on the quest's branch. */
  readonly test: boolean;
}

/** The fakes: the assignee writes the test, each judge hands in the next of VERDICTS; what each judge saw is kept. */
function runnersOf(kingdom: Bench, repo: string, seen: Seen[]) {
  const wrap = (fake: FakeRunner): AgentRunner => ({
    ...fake,
    spawn: async (req: SpawnRequest) => {
      if (req.role === 'assignee') await writeFile(path.join(req.cwd, 'e2e', 'sum.test.mjs'), TEST);
      const session = await fake.spawn(req);
      if (req.role !== 'verifier') return session;
      const head = git(repo, 'rev-parse', `quest/${req.quest?.id ?? ''}`);
      seen.push({ cwd: req.cwd, head, test: await pathExists(path.join(req.cwd, 'e2e', 'sum.test.mjs')) });
      const structured = VERDICTS[seen.length - 1];
      return { ...session, wait: async () => ({ ...(await session.wait()), structured }) };
    },
  });
  return { claude: wrap(kingdom.fakes.claude), gemini: wrap(kingdom.fakes.gemini) };
}

it("gives the run's next judge a fresh scratch plot and the last judge's trial (P1-42)", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria scratch again '));
  folders.push(repo);
  await gitRepoWith(repo, { 'src/sum.mjs': 'export const sum = (a, b) => a + b;\n', 'e2e/.keep': '' });
  current = await bench();
  await onRepo(current, repo, [], { checks: [E2E] });
  const seen: Seen[] = [];
  const base = gitPlots(current.root);
  let trials = 0;
  const plots: Plots = {
    ...base,
    trial: (request) => {
      trials += 1;
      return base.trial(request);
    },
  };
  running = current.steward({ plots, runners: runnersOf(current, repo, seen) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Wall judged twice', { tags: ['e2e'] }));
  await tickUntil(running, current.clock, statusIs(current, 'Wall judged twice', 'done'));
  const quest = await current.quest('Wall judged twice');
  const scratch = path.join(fromPortable(quest.plot.path ?? ''), '..', scratchIdOf(quest.id));
  expect(trials).toBe(1);
  expect(seen.map(({ cwd, test }) => [path.resolve(cwd), test])).toEqual([
    [path.resolve(scratch), true],
    [path.resolve(scratch), true],
  ]);
  expect(seen[1]?.head).toBe(seen[0]?.head);
  expect(await verdictIn(current, `${quest.id}-1`)).toMatchObject({
    result: 'pass',
    checks: expect.arrayContaining([expect.objectContaining({ id: 'e2e', pass: true })]) as unknown,
  });
  expect(await pathExists(scratch)).toBe(false);
}, 120_000);
