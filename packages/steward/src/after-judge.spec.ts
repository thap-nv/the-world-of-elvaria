// A judge outside a scratch plot leaves the quest's plot as its commit has it (P1-44, P1-37 (f)): in the P1-37 run a
// judge ran a check's generator (`pnpm api:openapi`) in the plot of the part it judged, which dropped the contract
// from the working tree, 166 lines, uncommitted. Real git repos and PlotManager; FakeRunners whose judge writes in its
// cwd as such a command would.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { fromPortable } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { FAIL, RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { folderPlots } from './plots.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';

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

const CONTRACT = '{"paths": {"/periods": {}}}\n';
const CONTRACT_FILE = 'apps/api/openapi.json';

/** What the plot holds of the contract when each assignee session opens. */
const seen: string[] = [];

/** The bench's runners: a judge's command rewrites the contract and leaves output; an assignee notes the contract. */
function generatingJudges(kingdom: Bench): Record<'claude' | 'gemini', AgentRunner> {
  const wrap = (runner: AgentRunner): AgentRunner => ({
    ...runner,
    spawn: async (req: SpawnRequest) => {
      if (req.role === 'assignee') seen.push(await readFile(path.join(req.cwd, CONTRACT_FILE), 'utf8'));
      else {
        await writeFile(path.join(req.cwd, CONTRACT_FILE), '{"paths": {}}\n');
        await mkdir(path.join(req.cwd, 'generated'), { recursive: true });
        await writeFile(path.join(req.cwd, 'generated', 'api-types.ts'), 'export {};\n');
      }
      return runner.spawn(req);
    },
  });
  return { claude: wrap(kingdom.runners.claude), gemini: wrap(kingdom.runners.gemini) };
}

async function open(options: Parameters<typeof bench>[0] = {}, plots?: (root: string) => Plots) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria judged repo '));
  folders.push(repo);
  await gitRepoWith(repo, { [CONTRACT_FILE]: CONTRACT, 'src/app.ts': 'export const app = 1;\n' });
  current = await bench(options);
  await onRepo(current, repo, []);
  seen.length = 0;
  running = current.steward({
    plots: (plots ?? gitPlots)(current.root),
    runners: generatingJudges(current),
  });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const restoredLines = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.filter(({ type }) => type === 'plot.restored');

describe("the quest's plot after a judge outside a scratch plot", () => {
  it('goes back to its commit, and the journal says what went', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Judged with a generator'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Judged with a generator')).status === 'done',
    );
    const quest = await kingdom.quest('Judged with a generator');
    const worktree = fromPortable(quest.plot.path ?? '');
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(await readFile(path.join(worktree, CONTRACT_FILE), 'utf8')).toBe(CONTRACT);
    const [line, ...more] = await restoredLines(kingdom);
    expect(more).toEqual([]);
    const judge = quest.attempt_log.find(({ role }) => role === 'verifier');
    expect(line).toMatchObject({
      quest: quest.id,
      session: judge?.session_id,
      data: { paths: [CONTRACT_FILE, 'generated/'] },
    });
    expect(kingdom.warnings.join('\n')).toContain(
      `${quest.id}: the judge's commands left 2 path(s) changed in the plot (${CONTRACT_FILE}, generated/); they were dropped`,
    );
  });

  it("is clean before the returned assignee opens, so the judge's changes never reach the branch", async () => {
    const { kingdom, steward } = await open({ plays: { verdicts: { 'Returned once': [FAIL] } } });
    await kingdom.command('create_quest', questPayload('Returned once'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Returned once')).status === 'done',
    );
    const quest = await kingdom.quest('Returned once');
    expect(seen).toEqual([CONTRACT, CONTRACT]);
    const worktree = fromPortable(quest.plot.path ?? '');
    expect(git(worktree, 'diff', '--name-only', 'main', 'HEAD')).not.toContain(CONTRACT_FILE);
    expect(await restoredLines(kingdom)).toHaveLength(2);
  });

  it('costs a warning when it cannot be put back, and nothing on a plot without git', async () => {
    const broken = (root: string): Plots => ({
      ...gitPlots(root),
      restore: () => Promise.reject(new Error('index.lock exists')),
    });
    const { kingdom, steward } = await open({}, broken);
    await kingdom.command('create_quest', questPayload('Left as it is'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Left as it is')).status === 'done',
    );
    expect(kingdom.warnings.join('\n')).toContain(
      'the plot was not put back after its judge: index.lock exists',
    );
    expect(await restoredLines(kingdom)).toEqual([]);
    expect(await folderPlots(kingdom.root).restore({ type: 'none' })).toEqual([]);
  });
});
