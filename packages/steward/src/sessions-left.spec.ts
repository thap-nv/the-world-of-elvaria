// sessionsLeftBehind (P1-11): what `elvaria doctor` reports from `.state/sessions.json` while no Steward holds
// `.state/steward.lock`: the sessions a dead Steward left running, which the next `elvaria run` kills. stewardRuns
// (P1-56) is the same question on its own.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { POWERSHELL_TIMEOUT_MS } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from './__fixtures__/kingdom.ts';
import { SESSIONS_FILE } from './sessions/pids.ts';
import { sessionsLeftBehind, stewardRuns } from './steward.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
const children: number[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
  for (const pid of children.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ended already.
    }
  }
});

const record = (root: string, sessions: readonly object[]) =>
  mkdir(path.join(root, '.state'), { recursive: true }).then(() =>
    writeFile(path.join(root, SESSIONS_FILE), JSON.stringify({ version: 1, sessions })),
  );

describe('stewardRuns', () => {
  it('is true only while a Steward holds the kingdom lock (P1-56: the CLI waits for an answer only then)', async () => {
    current = await bench();
    expect(await stewardRuns(current.root)).toBe(false);
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    expect(await stewardRuns(current.root)).toBe(true);
    await running.stop();
    running = undefined;
    expect(await stewardRuns(current.root)).toBe(false);
  });
});

describe('sessionsLeftBehind', () => {
  it('is empty without a record', async () => {
    current = await bench();
    expect(await sessionsLeftBehind(current.root)).toEqual([]);
  });

  // One or two cold PowerShells on a Windows CI runner (runner-core's POWERSHELL_TIMEOUT_MS each, at worst).
  it(
    'names a session still running while no Steward holds the lock, none while one does, never a reused pid',
    { timeout: 3 * POWERSHELL_TIMEOUT_MS },
    async () => {
      current = await bench();
      const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const pid = orphan.pid ?? 0;
      children.push(pid);
      const left = {
        quest: 'q_20261107_aaaaaa',
        role: 'assignee',
        character: 'kael',
        pid,
        spawned_at: new Date().toISOString(),
      };
      // This very process holds that pid now, started long after the session's spawn.
      const reused = {
        ...left,
        quest: 'q_20261107_bbbbbb',
        pid: process.pid,
        spawned_at: '2026-01-01T00:00:00Z',
      };
      await record(current.root, [left, reused]);
      expect(await sessionsLeftBehind(current.root)).toEqual([{ ...left, process: 'same' }]);
      // A live Steward's sessions are its own: the same record says nothing while it holds the lock. start()
      // reaps the record, so the session is written again after it.
      running = current.steward();
      expect(await running.start({ loop: false })).toEqual({ ok: true });
      const held = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      children.push(held.pid ?? 0);
      await record(current.root, [{ ...left, pid: held.pid ?? 0 }]);
      expect(await sessionsLeftBehind(current.root)).toEqual([]);
    },
  );
});
