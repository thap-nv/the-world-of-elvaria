// runOnce past its timeout (owner's decision after P1-06): the CLI's whole tree goes, so a child it started that
// still holds stdout cannot keep the call from ending.
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

import { isAlive, noAnswerWithin } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { runOnce } from './run-once.ts';

/** Prints the pid of a child that shares its stdout, then waits forever, as the child does. */
const HOLDS_STDOUT = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
  'console.log(child.pid);',
  'setInterval(() => {}, 1000);',
].join('\n');

async function goneWithin(pid: number, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms && isAlive(pid); waited += 50) await sleep(50);
  return !isAlive(pid);
}

describe('runOnce', () => {
  it('kills the tree of a call past its timeout, even when a child holds stdout', async () => {
    const ran = await runOnce({ file: process.execPath, args: ['-e', HOLDS_STDOUT] }, [], {
      env: {},
      cwd: tmpdir(),
      timeoutMs: 1000,
    });
    expect(ran).toMatchObject({ code: null, problem: noAnswerWithin(1000) });
    const child = Number(ran.stdout.trim());
    expect(child).toBeGreaterThan(0);
    // No timeout of its own: one under the package's (vitest.config.ts) only fails sooner on a busy machine (P1-39).
    expect(await goneWithin(child, 5000)).toBe(true);
  });
});
