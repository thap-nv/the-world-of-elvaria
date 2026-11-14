// A check that fails (lessons of 2026-11-13): its session's process tree is killed, and its workspace is handed to the
// target before it goes. Before, `submit` past its ceiling only removed the folder: the real agy ran on to 80 369
// tokens, its hook lost policy.json with `.runs`, and the folder stayed held (`EBUSY`).
import { access } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cleanUp, goneWithin, startTree } from '../__fixtures__/tree.ts';
import { createFakeRunner } from '../runner/fake-runner.ts';
import { CONFORMANCE_CHECKS } from './checks.ts';
import { CONFORMANCE_QUEST } from './workspace.ts';
import type { Tree } from '../__fixtures__/tree.ts';
import type { AgentRunner, RunResult, RunningSession } from '../runner/types.ts';
import type { ConformanceCheck, FailedWorkspace, LeftWorkspace } from './target.ts';

function checkOf(id: string): ConformanceCheck {
  const check = CONFORMANCE_CHECKS.find((entry) => entry.id === id);
  if (check === undefined) throw new Error(`no check ${id}`);
  return check;
}

const exists = (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  );

let tree: Tree | undefined;
afterEach(() => {
  cleanUp(tree);
  tree = undefined;
});

const KILLED: RunResult = {
  outcome: 'killed',
  exit_code: null,
  usage: { tokens: 0 },
  session_id: 'hung',
  duration_ms: 0,
  permission_denials: [],
  rate_limited: false,
};

/** A runner whose session is a real process tree that never answers, and whose own kill does nothing. */
function hungRunner(): AgentRunner {
  return {
    ...createFakeRunner(),
    spawn: async () => {
      const started = await startTree();
      tree = started;
      const exited = new Promise<void>((resolve) => {
        started.parent.once('exit', () => {
          resolve();
        });
      });
      const session: RunningSession = {
        session_id: Promise.resolve('hung'),
        pid: started.parent.pid ?? 0,
        signals: (async function* () {
          await exited;
          yield* [];
        })(),
        wait: () => exited.then(() => KILLED),
        kill: () => Promise.resolve(),
      };
      return session;
    },
  };
}

describe('a check that fails', () => {
  it("kills its session's process tree, then hands its workspace over before removing it", async () => {
    const handed: { kept: FailedWorkspace; runs: boolean; gone: boolean }[] = [];
    const target = {
      name: 'hung',
      timeout_ms: 300,
      createRunner: hungRunner,
      onFailed: async (kept: FailedWorkspace) => {
        const runs = await exists(path.join(kept.dir, '.runs', `${CONFORMANCE_QUEST}-1`));
        handed.push({ kept, runs, gone: await goneWithin(tree?.grandchild ?? 0) });
      },
    };
    const late = 'submit: wait: no answer within 300 ms';
    await expect(checkOf('submit').run(target)).rejects.toThrow(late);
    expect(handed).toEqual([
      {
        kept: { scenario: 'submit', dir: expect.any(String) as string, problem: late },
        runs: true,
        gone: true,
      },
    ]);
    expect(await goneWithin(tree?.parent.pid ?? 0)).toBe(true);
    expect(await exists(handed[0]?.kept.dir ?? '')).toBe(false);
  });

  it('hands over the workspace of a session that breaks the contract, and none of one that keeps it', async () => {
    const handed: FailedWorkspace[] = [];
    const target = (scenario: 'submit' | 'crash') => ({
      name: 'fake',
      createRunner: () => createFakeRunner({ scenarioOf: () => scenario }),
      onFailed: (kept: FailedWorkspace) => {
        handed.push(kept);
      },
    });
    await expect(checkOf('crash').run(target('submit'))).rejects.toThrow("'error'");
    expect(handed.map(({ scenario }) => scenario)).toEqual(['crash']);
    expect(await checkOf('crash').run(target('crash'))).toBe('passed');
    expect(handed).toHaveLength(1);
  });

  it('says a workspace it could not hand over as one left, and keeps the check its own failure', async () => {
    const left: LeftWorkspace[] = [];
    const target = {
      name: 'fake',
      createRunner: () => createFakeRunner({ scenarioOf: () => 'submit' }),
      onFailed: () => Promise.reject(new Error('ENOSPC: no space left on device')),
      onLeftover: (leftover: LeftWorkspace) => left.push(leftover),
    };
    await expect(checkOf('crash').run(target)).rejects.toThrow("'error'");
    expect(left).toEqual([
      { scenario: 'crash', dir: expect.any(String) as string, problem: 'ENOSPC: no space left on device' },
    ]);
  });
});
