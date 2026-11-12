// startChild and runToEnd (moved from runner-antigravity, P1-06): lines of stdout as they come, the end of stderr,
// the exit, and a kill or a timeout that takes the whole tree.
import { afterEach, describe, expect, it } from 'vitest';

import { IDLE_SCRIPT, cleanUp, goneWithin, treeScript } from '../__fixtures__/tree.ts';
import { runToEnd, startChild } from './child.ts';
import type { Tree } from '../__fixtures__/tree.ts';

const NODE = { file: process.execPath, args: ['-e'] };
const ENV = { PATH: process.env.PATH ?? '' };

let tree: Tree | undefined;
afterEach(() => {
  cleanUp(tree);
  tree = undefined;
});

describe('startChild', () => {
  it('hands each stdout line over, keeps stderr and reports the exit', async () => {
    const lines: string[] = [];
    const chunks: string[] = [];
    const child = startChild(
      NODE,
      ['console.log("one\\ntwo"); console.error("oops"); process.exit(3)'],
      { env: ENV, onStderr: (chunk) => chunks.push(chunk) },
      (line) => lines.push(line),
    );
    expect(child.pid).toBeGreaterThan(0);
    expect(await child.exit).toEqual({ code: 3, signal: null });
    expect(lines).toEqual(['one', 'two']);
    expect(child.stderr()).toBe('oops\n');
    expect(chunks.join('')).toBe('oops\n');
    child.kill();
  });

  it('kills the whole tree', async () => {
    let grandchild = 0;
    const child = startChild(NODE, [treeScript()], { env: ENV, kill_grace_ms: 1000 }, (line) => {
      grandchild = Number(line);
    });
    while (grandchild === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    child.kill();
    await child.exit;
    expect(await goneWithin(grandchild)).toBe(true);
  });

  it('writes stdin when asked, then closes it (Codex reads its prompt there, P1-12d)', async () => {
    const lines: string[] = [];
    const script =
      'let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => console.log(s.length, s.slice(-3)))';
    const child = startChild(NODE, [script], { env: ENV, stdin: `${'x'.repeat(40_000)}end` }, (line) =>
      lines.push(line),
    );
    expect(await child.exit).toEqual({ code: 0, signal: null });
    expect(lines).toEqual(['40003 end']);
  });

  it('survives a child that ends without reading its stdin', async () => {
    const child = startChild(
      NODE,
      ['process.exit(0)'],
      { env: ENV, stdin: 'y'.repeat(1_000_000) },
      () => undefined,
    );
    expect((await child.exit).code).toBe(0);
  });

  it('says why a program could not start', async () => {
    const child = startChild({ file: 'no such program here', args: [] }, [], { env: ENV }, () => undefined);
    expect((await child.exit).failure).toMatch(/ENOENT/);
  });
});

describe('runToEnd', () => {
  it('returns all of stdout once the program ends', async () => {
    expect(
      await runToEnd(NODE, ['console.log("a"); console.log("b")'], { env: ENV, timeout_ms: 10_000 }),
    ).toEqual({ code: 0, signal: null, stdout: 'a\nb', stderr: '', timed_out: false });
  });

  it('kills a program that runs past its timeout', async () => {
    const ran = await runToEnd(NODE, [IDLE_SCRIPT], { env: ENV, timeout_ms: 200 });
    expect(ran.timed_out).toBe(true);
    expect(ran.code === 0).toBe(false);
  });
});
