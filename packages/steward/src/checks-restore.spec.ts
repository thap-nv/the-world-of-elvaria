// The machine checks leave the quest's plot as its commit has it before the judge opens (P1-47, (b) of P1-44): a
// drift check (`pnpm api:openapi`, then `git diff --exit-code`) regenerates files in the plot it runs in, and the
// judge, or a returned assignee, would find them there. Real git repos and PlotManager; a check that writes as such a
// command does.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { fromPortable } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';
import type { AgentRunner, CheckRun, SpawnRequest } from '@elvaria/runner-core';

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

/** A drift check: it regenerates the contract and its types in the plot it runs in, then passes. */
const generatingCheck: Plots['check'] = async ({ plot, run_dir: runDir }) => {
  const cwd = fromPortable(plot.path ?? '');
  await writeFile(path.join(cwd, CONTRACT_FILE), '{"paths": {}}\n');
  await mkdir(path.join(cwd, 'generated'), { recursive: true });
  await writeFile(path.join(cwd, 'generated', 'api-types.ts'), 'export {};\n');
  const drift: CheckRun = {
    id: 'openapi_drift' as CheckRun['id'],
    pass: true,
    duration_ms: 1,
    log_path: `${runDir}/checks/openapi_drift.log`,
    exit_code: 0,
    timed_out: false,
  };
  return [drift];
};

/** What the judge found when its session opened: the plot's changes, and the `plot.restored` lines so far. */
interface Seen {
  readonly status: string;
  readonly contract: string;
  readonly restored: number;
}

const restoredLines = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.filter(({ type }) => type === 'plot.restored');

function watchingJudges(kingdom: Bench, seen: Seen[]): Record<'claude' | 'gemini', AgentRunner> {
  const wrap = (runner: AgentRunner): AgentRunner => ({
    ...runner,
    spawn: async (req: SpawnRequest) => {
      if (req.role === 'verifier') {
        const contract = await readFile(path.join(req.cwd, CONTRACT_FILE), 'utf8');
        const restored = (await restoredLines(kingdom)).length;
        seen.push({ status: git(req.cwd, 'status', '--porcelain'), contract, restored });
      }
      return runner.spawn(req);
    },
  });
  return { claude: wrap(kingdom.runners.claude), gemini: wrap(kingdom.runners.gemini) };
}

async function open(restore?: Plots['restore']) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria checked repo '));
  folders.push(repo);
  await gitRepoWith(repo, { [CONTRACT_FILE]: CONTRACT, 'src/app.ts': 'export const app = 1;\n' });
  current = await bench();
  await onRepo(current, repo, []);
  const seen: Seen[] = [];
  const base = gitPlots(current.root);
  const plots: Plots = { ...base, check: generatingCheck, ...(restore === undefined ? {} : { restore }) };
  running = current.steward({ plots, runners: watchingJudges(current, seen) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, seen };
}

describe("the quest's plot after the machine checks (P1-47)", () => {
  it('goes back to its commit before the judge opens, and the journal says what went', async () => {
    const { kingdom, steward, seen } = await open();
    await kingdom.command('create_quest', questPayload('Checked with a generator'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Checked with a generator', 'done'));
    const quest = await kingdom.quest('Checked with a generator');
    expect(seen).toEqual([{ status: '', contract: CONTRACT, restored: 1 }]);
    const [line, ...more] = await restoredLines(kingdom);
    // The judge's own commands left nothing: one line, the checks', with no session.
    expect(more).toEqual([]);
    expect(line).toMatchObject({ quest: quest.id, data: { paths: [CONTRACT_FILE, 'generated/'] } });
    expect(line?.session).toBeUndefined();
    expect(kingdom.warnings.join('\n')).toContain(
      `${quest.id}: the checks' commands left 2 path(s) changed in the plot (${CONTRACT_FILE}, generated/); they were dropped`,
    );
    expect(git(fromPortable(quest.plot.path ?? ''), 'status', '--porcelain')).toBe('');
  });

  it('costs a warning when it cannot be put back, and the judge still opens', async () => {
    const { kingdom, steward, seen } = await open(() => Promise.reject(new Error('index.lock exists')));
    await kingdom.command('create_quest', questPayload('Left as the checks left it'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Left as the checks left it', 'done'));
    expect(kingdom.warnings.join('\n')).toContain(
      'the plot was not put back after its checks: index.lock exists',
    );
    expect(seen).toHaveLength(1);
    expect(await restoredLines(kingdom)).toEqual([]);
  });
});
