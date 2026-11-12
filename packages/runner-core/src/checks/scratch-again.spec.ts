import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { acquireLock, inKingdom, pathExists } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from '../plot/plot-manager.ts';
import { scratchIdOf } from '../plot/scratch.ts';
import { exclusiveLockOf, lockBusyLine } from './exclusive-lock.ts';
import { scratchAgain, scratchResetLogOf } from './scratch-again.ts';

// The run's next judge's scratch plot, made again without the trial (P1-42), then commands.reset once (P1-47, (d) of
// P1-42): the second judge meets a clean database, not the one the first judge's breaks left.
let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria scratch again '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

/** Appends one line to `reset.txt` in its cwd: how many times reset ran in this plot. */
const COUNTING_RESET = "node -e \"require('node:fs').appendFileSync('reset.txt', 'reset\\n')\"";

/** A repo whose quest has its plot, and a manager over the kingdom. */
async function questOn(folder: string, suffix: string, fields: Record<string, unknown> = {}) {
  const repo = await gitRepo(path.join(root, folder));
  const territory = territoryAt(repo, fields);
  const quest = { id: questId(suffix) };
  const manager = createPlotManager({ kingdom, host: TEST_HOST });
  const prepared = await manager.prepare(quest, territory);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  const scratch = path.join(repo, '.elvaria', 'worktrees', scratchIdOf(quest.id));
  return { repo, territory, quest, manager, scratch };
}

const logOf = (questIdOf: string) => path.join(kingdom, ...scratchResetLogOf(questIdOf).split('/'));

describe('a scratch plot made again for the next judge', () => {
  it('runs commands.reset once after setup, with a log of its own', async () => {
    const setup = "node -e \"require('node:fs').writeFileSync('set.txt', 'up')\"";
    const { territory, quest, manager, scratch } = await questOn('Tool - DC1', 'a1b2c3', {
      commands: { setup, reset: COUNTING_RESET },
    });
    await scratchAgain(manager, { kingdom, quest, territory }, TEST_HOST);
    expect(await readFile(path.join(scratch, 'set.txt'), 'utf8')).toBe('up');
    expect(await readFile(path.join(scratch, 'reset.txt'), 'utf8')).toBe('reset\n');
    expect(scratchResetLogOf(quest.id)).toBe(`.runs/${quest.id}-verify-reset.log`);
    expect((await readFile(logOf(quest.id), 'utf8')).split('\n')[0]).toBe(`$ ${COUNTING_RESET}`);
    // Made again for a third judge: a fresh plot, reset once more there.
    await scratchAgain(manager, { kingdom, quest, territory }, TEST_HOST);
    expect(await readFile(path.join(scratch, 'reset.txt'), 'utf8')).toBe('reset\n');
  });

  it('skips the reset of a territory that declares none, and writes no log', async () => {
    const { territory, quest, manager, scratch } = await questOn('no reset', 'b2c3d4');
    await scratchAgain(manager, { kingdom, quest, territory }, TEST_HOST);
    expect(await pathExists(scratch)).toBe(true);
    expect(await pathExists(logOf(quest.id))).toBe(false);
  });

  it("gives the reset the quest's secrets, masked in its log", async () => {
    const { repo, territory, quest, manager } = await questOn('private db', 'c3d4e5', {
      commands: { reset: 'node reset.mjs' },
    });
    const work = path.join(repo, '.elvaria', 'worktrees', quest.id);
    await commitFile(
      work,
      'reset.mjs',
      'if (!process.env.DB_TOKEN) process.exit(4);\nconsole.log(`reset with ${process.env.DB_TOKEN}`);\n',
    );
    const value = ['plain', '-FAKE-', 'database-47'].join('');
    await scratchAgain(manager, { kingdom, quest, territory, secrets: { db_token: value } }, TEST_HOST);
    const log = await readFile(logOf(quest.id), 'utf8');
    expect(log).toContain('reset with [redacted]');
    expect(log.split(value)).toHaveLength(1);
  });

  it('throws when the reset fails, is stopped, or the plot cannot be made', async () => {
    const failing = await questOn('failing reset', 'd4e5f6', {
      commands: { reset: 'node -e "process.exit(3)"' },
    });
    await expect(scratchAgain(failing.manager, { kingdom, ...failing }, TEST_HOST)).rejects.toThrow(
      `commands.reset of ${failing.quest.id}'s scratch plot ended with 3 (.runs/`,
    );
    const stopped = await questOn('stopped reset', 'e5f6g7', { commands: { reset: COUNTING_RESET } });
    const signal = AbortSignal.abort();
    await expect(scratchAgain(stopped.manager, { kingdom, ...stopped, signal }, TEST_HOST)).rejects.toThrow(
      'commands.reset',
    );
    const none = { id: questId('f6g7h8') };
    await expect(
      scratchAgain(failing.manager, { kingdom, quest: none, territory: failing.territory }, TEST_HOST),
    ).rejects.toThrow(`the scratch plot of ${none.id} is not ready (git_failed)`);
  });

  // P1-54: a reset outside the lock pulled down another quest's e2e stack three times in P1-50.
  it("runs no reset while another quest keeps the territory's exclusive lock, and throws", async () => {
    const kept = await questOn('kept lock', 'g7h8j9', { commands: { reset: COUNTING_RESET } });
    const held = await acquireLock(inKingdom(kingdom, exclusiveLockOf(kept.territory.id)), { wait: false });
    if (!held.ok) throw new Error('lock');
    try {
      const request = { kingdom, ...kept, lock_wait_ms: 200 };
      await expect(scratchAgain(kept.manager, request, TEST_HOST)).rejects.toThrow(
        `commands.reset of ${kept.quest.id}'s scratch plot did not run: ${lockBusyLine(kept.territory.id, 200)}`,
      );
      expect(await pathExists(path.join(kept.scratch, 'reset.txt'))).toBe(false);
      expect(await readFile(logOf(kept.quest.id), 'utf8')).toContain(lockBusyLine(kept.territory.id, 200));
    } finally {
      await held.value.release();
    }
  });
});
