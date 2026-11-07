// killTree on this machine's own processes (implementation-plan §3.4): CI runs it on Windows (taskkill /T /F) and
// on macOS (SIGTERM, then SIGKILL after the grace period), each with a real tree of node processes.
import { afterEach, describe, expect, it } from 'vitest';

import { cleanUp, endedPid, goneWithin, startTree } from '../__fixtures__/tree.ts';
import { isAlive, killTree } from './kill-tree.ts';
import type { Tree } from '../__fixtures__/tree.ts';

let tree: Tree | undefined;
afterEach(() => {
  cleanUp(tree);
  tree = undefined;
});

describe('killTree', () => {
  it('ends a process and the grandchild it started', async () => {
    tree = await startTree();
    const exited = new Promise((resolve) => tree?.parent.once('exit', resolve));
    await killTree(tree.parent.pid ?? 0);
    await exited;
    expect(await goneWithin(tree.grandchild)).toBe(true);
  });

  it.runIf(process.platform !== 'win32')(
    'sends SIGKILL to a tree that ignores SIGTERM once the grace period is over',
    async () => {
      tree = await startTree(true);
      const begun = performance.now();
      await killTree(tree.parent.pid ?? 0, { grace_ms: 300 });
      expect(performance.now() - begun).toBeGreaterThanOrEqual(250);
      expect(await goneWithin(tree.parent.pid ?? 0)).toBe(true);
      expect(await goneWithin(tree.grandchild)).toBe(true);
    },
  );

  it('has nothing to kill for pid 0 (FakeRunner) or a process that already ended', async () => {
    await expect(killTree(0)).resolves.toBeUndefined();
    await expect(killTree(-3)).resolves.toBeUndefined();
    await expect(killTree(await endedPid())).resolves.toBeUndefined();
  });
});

describe('isAlive', () => {
  it('tells a running process from one that ended', async () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(await endedPid())).toBe(false);
  });
});
