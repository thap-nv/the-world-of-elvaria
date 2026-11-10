// commands.setup killed by its caller's signal (P1-49, (a) of P1-47): a Steward stopped with Ctrl+C no longer waits up
// to SETUP_TIMEOUT_MS for a `pnpm install`, in the quest's plot or in a judge's scratch plot, and the plot stays not
// set up, so the next prepare runs it again.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import { scratchIdOf } from './scratch.ts';
import { setupLogOf } from './setup.ts';

/** Done at once once `ready` is there; else says it started and runs until killed, like a cold install. */
const HANGING_SETUP = [
  "import { existsSync, writeFileSync } from 'node:fs';",
  "if (existsSync('ready')) process.exit(0);",
  "writeFileSync('started', '');",
  'setInterval(() => {}, 1000);',
  '',
].join('\n');

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria setup signal '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

/** Aborts `control` once `file` exists: the setup is running, not merely about to start. */
async function abortOnceStarted(file: string, control: AbortController): Promise<void> {
  for (let tries = 0; tries < 600 && !existsSync(file); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  control.abort();
}

describe('commands.setup and its signal (P1-49)', () => {
  it("is killed when the quest plot's signal aborts, and runs again on the next prepare", async () => {
    const repo = await gitRepo(path.join(root, 'quest plot'));
    await commitFile(repo, 'setup.mjs', HANGING_SETUP);
    const territory = territoryAt(repo, { commands: { setup: 'node setup.mjs' } });
    const quest = { id: questId('s1g2n3') };
    const manager = createPlotManager({ kingdom, host: TEST_HOST });
    const worktree = path.join(repo, '.elvaria', 'worktrees', quest.id);
    const control = new AbortController();

    const started = Date.now();
    const [stopped] = await Promise.all([
      manager.prepare(quest, territory, { signal: control.signal }),
      abortOnceStarted(path.join(worktree, 'started'), control),
    ]);

    expect(Date.now() - started).toBeLessThan(30_000);
    expect(stopped).toEqual({
      ok: false,
      error: {
        reason: 'setup_failed',
        detail: 'node setup.mjs: stopped before its end',
        log_path: setupLogOf(quest.id),
      },
    });
    expect(await readFile(path.join(kingdom, setupLogOf(quest.id)), 'utf8')).toContain(
      'elvaria: stopped before its end',
    );
    await writeFile(path.join(worktree, 'ready'), '');
    expect(await manager.prepare(quest, territory)).toMatchObject({
      ok: true,
      value: { created: false, setup: { exit_code: 0 } },
    });
  });

  it("is killed in a judge's scratch plot too", async () => {
    const repo = await gitRepo(path.join(root, 'scratch plot'));
    await commitFile(repo, 'setup.mjs', HANGING_SETUP);
    const quest = { id: questId('s4g5n6') };
    const manager = createPlotManager({ kingdom, host: TEST_HOST });
    // The quest's own plot first, without a setup: the scratch plot is made from its branch.
    expect((await manager.prepare(quest, territoryAt(repo))).ok).toBe(true);
    const territory = territoryAt(repo, { commands: { setup: 'node setup.mjs' } });
    const scratch = path.join(repo, '.elvaria', 'worktrees', scratchIdOf(quest.id));
    const control = new AbortController();

    const [stopped] = await Promise.all([
      manager.prepareScratch(quest, territory, { signal: control.signal }),
      abortOnceStarted(path.join(scratch, 'started'), control),
    ]);

    expect(stopped).toEqual({
      ok: false,
      error: {
        reason: 'setup_failed',
        detail: 'node setup.mjs: stopped before its end',
        log_path: setupLogOf(scratchIdOf(quest.id)),
      },
    });
  });
});
