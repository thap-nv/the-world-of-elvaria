// A Steward that stops while a delivery pushes (PS-08c, (L) of PS-08): the push runs the territory's pre-push hook, a
// tree of processes, and the stop kills the whole tree, on Windows (taskkill /T) and macOS (the process table)
// alike. Nothing is recorded: the next Steward delivers anew.
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { isAlive } from '@elvaria/runner-core';
import { pathExists, toPortable } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { delivered } from '../__fixtures__/deliver.ts';
import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;
const folders: TempDir[] = [];

afterEach(async () => {
  await current?.remove();
  current = undefined;
  await Promise.all(folders.splice(0).map((folder) => folder.remove()));
});

const POLL_MS = 50;
/** Real time the push gets to reach its hook, and the kill to take the tree. */
const WAIT_MS = 30_000;

/** A hook's node that starts a grandchild, which writes its pid and, like the hook, never ends on its own. */
const HOOK_SCRIPT = [
  "import { spawn } from 'node:child_process';",
  'const code = "require(\'node:fs\').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);";',
  "spawn(process.execPath, ['-e', code, process.argv[2]], { stdio: 'ignore' });",
  'setInterval(() => {}, 1000);',
  '',
].join('\n');

async function until(holds: () => Promise<boolean> | boolean): Promise<boolean> {
  for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
    if (await holds()) return true;
    await sleep(POLL_MS);
  }
  return holds();
}

/** The territory repo's pre-push hook (its worktrees share it) runs HOOK_SCRIPT; the grandchild's pid file. */
async function hangingHook(repo: string): Promise<string> {
  const temp = await tempDir('forge hook');
  const folder = temp.root;
  folders.push(temp);
  const script = path.join(folder, 'hook.mjs');
  const pidFile = path.join(folder, 'grandchild.pid');
  await writeFile(script, HOOK_SCRIPT);
  const quoted = [process.execPath, script, pidFile].map((part) => `"${toPortable(part)}"`).join(' ');
  const hook = path.join(repo, '.git', 'hooks', 'pre-push');
  await writeFile(hook, `#!/bin/sh\n${quoted}\n`);
  await chmod(hook, 0o755);
  return pidFile;
}

async function stopKillsThePush(): Promise<void> {
  current = await forgeBench({ delivery: { mode: 'pr' } });
  const { kingdom } = current;
  const pidFile = await hangingHook(current.repo);
  const steward = await current.start();
  await kingdom.command('create_quest', questPayload('Rooms API'));
  await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Rooms API'));
  const quest = await kingdom.quest('Rooms API');
  // The tick after the delivery note starts the push outside the tick.
  await steward.tick();
  expect(await until(() => pathExists(pidFile))).toBe(true);
  const grandchild = Number(await readFile(pidFile, 'utf8'));
  expect(isAlive(grandchild)).toBe(true);

  await steward.stop();
  expect(await until(() => !isAlive(grandchild))).toBe(true);
  expect(await current.lines('delivery.pushed')).toEqual([]);
  expect(await current.lines('delivery.failed')).toEqual([]);
  expect(current.forge.calls).toEqual([]);
  expect(current.remoteTip(`quest/${quest.id}`)).toBe('');
}

describe("a Steward's stop during a push", () => {
  it.runIf(process.platform === 'win32')(
    "on Windows, kills the pre-push hook's whole tree and records nothing",
    stopKillsThePush,
  );
  it.runIf(process.platform === 'darwin')(
    "on macOS, kills the pre-push hook's whole tree and records nothing",
    stopKillsThePush,
  );
});
