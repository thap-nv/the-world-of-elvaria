// The judge of a quest judged in a scratch plot whose checks failed (P1-54, (f) of the P1-50 report): the pass rule
// fails the quest whatever the judge says, so the judge only reads why. It waits for no exclusive lock (P1-50: 9 to 33
// minutes of waiting for a session of 11 to 34 seconds) and, holding none, runs none of the exclusive checks.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import type { TerritoryId } from '@elvaria/domain';
import { exclusiveLockOf } from '@elvaria/runner-core';
import type { AgentRunner, FakeRunner, SpawnRequest } from '@elvaria/runner-core';
import { acquireLock, inKingdom } from '@elvaria/store';
import type { HeldLock } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { gitPlots, gitRepoWith } from './__fixtures__/git-plots.ts';
import { RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
let other: HeldLock | undefined;
const folders: string[] = [];

afterEach(async () => {
  await other?.release();
  other = undefined;
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, RM_TEMP)));
  running = undefined;
  current = undefined;
});

/** A test that fails whatever the code: the e2e check is red in the trial's first run. */
const RED_TEST = 'process.exit(1);\n';
const E2E = {
  id: 'e2e',
  run: 'node e2e/sum.test.mjs',
  when: ['e2e/**'],
  exclusive: true,
  timeout_minutes: 1,
};
const FAIL = {
  result: 'fail',
  fail_kind: 'tests_fail',
  notes: 'e2e/sum.test.mjs exits 1 whatever src/sum.mjs does.',
};

/** The fakes: the assignee writes the red test, each judge fails the quest; the judges' requests are kept. */
function runnersOf(kingdom: Bench, judges: SpawnRequest[]) {
  const wrap = (fake: FakeRunner): AgentRunner => ({
    ...fake,
    spawn: async (req) => {
      if (req.role === 'assignee') await writeFile(path.join(req.cwd, 'e2e', 'sum.test.mjs'), RED_TEST);
      const session = await fake.spawn(req);
      if (req.role !== 'verifier') return session;
      judges.push(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured: FAIL }) };
    },
  });
  return { claude: wrap(kingdom.fakes.claude), gemini: wrap(kingdom.fakes.gemini) };
}

describe('the judge after failing checks in a scratch plot', () => {
  it('opens while another quest keeps the exclusive lock, and runs none of the exclusive checks', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria trial red '));
    folders.push(repo);
    await gitRepoWith(repo, { 'src/sum.mjs': 'export const sum = (a, b) => a + b;\n', 'e2e/.keep': '' });
    current = await bench();
    const read = await current.store.territories.read('dc1-se-team' as TerritoryId);
    if (!read.ok) throw new Error('fixture: no territory');
    const territory = {
      ...read.value,
      path: repo.replaceAll('\\', '/'),
      vcs: { type: 'git', default_branch: 'main' },
    };
    await current.store.territories.write(TerritorySchema.parse({ ...territory, checks: [E2E] }));
    const lock = inKingdom(current.root, exclusiveLockOf('dc1-se-team'));
    const base = gitPlots(current.root);
    // Another quest takes the lock as soon as the trial ended, and keeps it.
    const plots: Plots = {
      ...base,
      trial: async (request) => {
        const runs = await base.trial(request);
        const taken = await acquireLock(lock, { wait: false });
        if (taken.ok) other ??= taken.value;
        return runs;
      },
    };
    const judges: SpawnRequest[] = [];
    running = current.steward({ plots, runners: runnersOf(current, judges) });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    const kingdom = current;
    await kingdom.command('create_quest', questPayload('Red wall', { tags: ['e2e'] }));
    await tickUntil(running, kingdom.clock, () => Promise.resolve(judges.length > 0));
    expect(other).toBeDefined();
    expect(judges[0]?.permissions.allow).not.toContain('Bash(node e2e/sum.test.mjs:*)');
    expect(kingdom.warnings.join('\n')).not.toContain('its judge waits for the exclusive checks');
  }, 120_000);
});
