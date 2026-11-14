// doctor() when agy does not answer (fix/busy-machine): on a busy machine `agy models` can run out of time while the
// owner is signed in, and doctor must say so, with how long it had, never send the owner to sign in again. The CLI
// here is a Node script that never ends, whatever it is asked; the rest of doctor is in runner.spec.ts.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { noAnswerWithin } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, openWorld } from './__fixtures__/agy.ts';
import type { World } from './__fixtures__/agy.ts';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

describe('doctor, when agy does not answer', () => {
  it('says which call ran out of time and how long it had, never that the owner is signed out', async () => {
    const script = path.join(world.root, 'never answers.mjs');
    await writeFile(script, 'setInterval(() => undefined, 60_000);\n', 'utf8');
    const info = await fakeRunner({
      launch: { command: process.execPath, args: [script] },
      timeout_ms: 1000,
    }).doctor();
    expect(info).toMatchObject({ version: 'unknown', auth_ok: false });
    expect(info.detail).toBe(`agy --version: ${noAnswerWithin(1000)}; agy models: ${noAnswerWithin(1000)}`);
  });
});
