// doctor() when agy does not answer (fix/busy-machine): on a busy machine `agy models` can run out of time while the
// owner is signed in, and doctor must say so, with how long it had, never send the owner to sign in again; probe()
// says the same of `/usage` (fix/held-tribe-sessions). The CLI here is a Node script that never ends, whatever it is
// asked. And a hook that is not built: doctor fails, as every tribe's does. The rest of doctor is in runner.spec.ts.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { doctorNoteOf, noAnswerWithin } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, openWorld } from './__fixtures__/agy.ts';
import type { World } from './__fixtures__/agy.ts';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

/** A CLI that never ends, whatever it is asked. */
async function silentAgy(): Promise<{ command: string; args: string[] }> {
  const script = path.join(world.root, 'never answers.mjs');
  await writeFile(script, 'setInterval(() => undefined, 60_000);\n', 'utf8');
  return { command: process.execPath, args: [script] };
}

describe('doctor and probe, when agy does not answer', () => {
  it('says which call ran out of time and how long it had, never that the owner is signed out', async () => {
    const info = await fakeRunner({ launch: await silentAgy(), timeout_ms: 1000 }).doctor();
    expect(info).toMatchObject({ version: 'unknown', auth_ok: false });
    expect(info.notes).toEqual([
      doctorNoteOf('doctor:command_timed_out', { command: 'agy --version', seconds: 1 }),
      doctorNoteOf('doctor:command_timed_out', { command: 'agy models', seconds: 1 }),
    ]);
  });

  it('says /usage ran out of time, not that agy exited with no code', async () => {
    const result = await fakeRunner({ launch: await silentAgy(), timeout_ms: 1000 }).probe();
    expect(result).toEqual({ status: 'error', detail: `agy -p /usage: ${noAnswerWithin(1000)}` });
  });
});

describe('doctor, when the hook is not built', () => {
  it('fails however well agy answers: no session could run the hook', async () => {
    const missing = path.join(world.root, 'dist', 'elvaria-hook.js');
    const info = await fakeRunner({ hook: { command: process.execPath, args: [missing] } }).doctor();
    expect(info).toMatchObject({ auth_ok: false });
    expect(info.notes).toEqual([doctorNoteOf('doctor:hook_missing', { file: missing })]);
  });
});
