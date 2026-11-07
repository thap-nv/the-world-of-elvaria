// A real process tree for the kill specs (implementation-plan §3.4: "kill tree thật với một tiến trình con
// `node -e "setInterval(() => {}, 1000)"`"): node starts a grandchild that idles forever, prints its pid, and idles
// too. The grandchild's stdio is ignored, so it holds none of the pipes its parent's reader waits on.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { isAlive } from '../process/kill-tree.ts';

export const IDLE_SCRIPT = 'setInterval(() => {}, 1000);';

/** Prints the grandchild's pid on its first line. `deaf` children ignore SIGTERM (POSIX only matters). */
export const treeScript = (deaf = false): string =>
  [
    "const { spawn } = require('node:child_process');",
    `const idle = ${JSON.stringify(deaf ? `process.on('SIGTERM', () => {}); ${IDLE_SCRIPT}` : IDLE_SCRIPT)};`,
    "const child = spawn(process.execPath, ['-e', idle], { stdio: 'ignore' });",
    'console.log(child.pid);',
    ...(deaf ? ["process.on('SIGTERM', () => {});"] : []),
    IDLE_SCRIPT,
  ].join('\n');

export interface Tree {
  readonly parent: ChildProcess;
  readonly grandchild: number;
}

/** The tree, once the grandchild runs. */
export async function startTree(deaf = false): Promise<Tree> {
  const parent = spawn(process.execPath, ['-e', treeScript(deaf)], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  const grandchild = await new Promise<number>((resolve, reject) => {
    parent.stdout.setEncoding('utf8').once('data', (chunk: string) => {
      resolve(Number(chunk.trim().split('\n')[0]));
    });
    parent.once('error', reject);
  });
  return { parent, grandchild };
}

/** Whether `pid` is gone within `ms`: a killed process takes a moment to leave the table. */
export async function goneWithin(pid: number, ms = 5000): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 50) {
    if (!isAlive(pid)) return true;
    await sleep(50);
  }
  return !isAlive(pid);
}

/** A spec that failed halfway must not leave its tree running on the machine. */
export function cleanUp(tree: Tree | undefined): void {
  for (const pid of [tree?.parent.pid, tree?.grandchild]) {
    if (pid === undefined || !isAlive(pid)) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Gone meanwhile.
    }
  }
}

/** The pid of a process that ran and ended. */
export async function endedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => child.once('close', resolve));
  return child.pid ?? 0;
}
