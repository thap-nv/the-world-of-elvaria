// The plot after an agy session (P1-23, phase-1 report §5.3): hooks.json, its shim and GEMINI.md live only as long
// as the session, so the checks the Steward runs once it ends never read them; the territory's own files stay.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FAKE_AGY, fakeRunner, minimalEnv, openWorld, request } from './__fixtures__/agy.ts';
import { removeRunFiles, settleAll } from './run-files.ts';
import type { World } from './__fixtures__/agy.ts';
import type { RunningSession } from '@elvaria/runner-core';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

const inPlot = (...parts: string[]) => path.join(world.plot, ...parts);
const generated = () =>
  [inPlot('.agents', 'hooks.json'), inPlot('.agents', 'elvaria-hook.mjs'), inPlot('GEMINI.md')].filter(
    (file) => existsSync(file),
  );

/** Reads the signals as the Steward does, so the session is not held up by an unread channel. */
async function toTheEnd(session: RunningSession) {
  const signals: unknown[] = [];
  for await (const signal of session.signals) signals.push(signal);
  return { ...(await session.wait()), signals };
}

describe('the files of an agy session in the plot', () => {
  it('are there while the session runs and gone, with .agents/, once it ends: the checks see none of them', async () => {
    await writeFile(inPlot('CLAUDE.md'), '# Law\n', 'utf8');
    const session = await fakeRunner().spawn(request(world));
    expect(generated()).toHaveLength(3);
    const result = await toTheEnd(session);
    expect(result.outcome).toBe('completed');
    expect(generated()).toEqual([]);
    expect(existsSync(inPlot('.agents'))).toBe(false);
    expect(await readFile(inPlot('CLAUDE.md'), 'utf8')).toBe('# Law\n');
  });

  it('go when the Steward kills the session too, before kill() returns', async () => {
    const session = await fakeRunner().spawn(request(world, { ELVARIA_FAKE_SCENARIO: 'hang' }));
    expect(generated()).toHaveLength(3);
    await session.kill('breaker:time: ran 45 min, limit 45 min');
    expect(generated()).toEqual([]);
    expect((await session.wait()).outcome).toBe('killed');
  });

  it("leave the territory's own .agents/ content where it was", async () => {
    await mkdir(inPlot('.agents', 'skills'), { recursive: true });
    await writeFile(inPlot('.agents', 'skills', 'release.md'), '# Release\n', 'utf8');
    await toTheEnd(await fakeRunner().spawn(request(world)));
    expect(generated()).toEqual([]);
    expect(await readdir(inPlot('.agents'))).toEqual(['skills']);
  });

  it('go when the session never starts: agy runs a hook Elvaria does not control', async () => {
    const env = { ELVARIA_FAKE_AGY_GLOBAL_HOOK: path.join(world.root, 'hooks.json') };
    await expect(fakeRunner().spawn(request(world, env))).rejects.toThrow(/does not control/);
    expect(generated()).toEqual([]);
    expect(existsSync(inPlot('.agents'))).toBe(false);
  });

  it("go when the territory's own hooks.json refuses the session, which keeps that file", async () => {
    await mkdir(inPlot('.agents'), { recursive: true });
    await writeFile(inPlot('.agents', 'hooks.json'), '{"lint": {}}', 'utf8');
    await expect(fakeRunner().spawn(request(world))).rejects.toThrow(/belongs to the territory/);
    expect(generated()).toEqual([inPlot('.agents', 'hooks.json')]);
    expect(await readFile(inPlot('.agents', 'hooks.json'), 'utf8')).toBe('{"lint": {}}');
  });

  it('say so in stderr.log when one cannot go, and the refusal still reaches the Steward', async () => {
    await mkdir(inPlot('GEMINI.md'));
    await expect(fakeRunner().spawn(request(world))).rejects.toThrow(/EISDIR/);
    const stderr = await readFile(path.join(world.run_dir, 'stderr.log'), 'utf8');
    expect(stderr).toMatch(/^\[elvaria\] the hook files stay in the plot: .*EISDIR/);
  });
});

describe("the run folder's settings.json (fix/agy-1-5-7)", () => {
  it('keeps agy in the Default agent mode, a top-level key beside the permissions, and the fake agy runs it', async () => {
    const result = await toTheEnd(await fakeRunner().spawn(request(world)));
    expect(result.outcome).toBe('completed');
    const settings = JSON.parse(await readFile(path.join(world.run_dir, 'settings.json'), 'utf8')) as object;
    expect(Object.keys(settings)).toEqual(['permissions', 'agentMode']);
    expect(settings).toMatchObject({ agentMode: '' });
  });

  it('is what the fake agy holds the adapter to: settings without the key would start agy 1.5.7 in Auto', async () => {
    const file = path.join(world.run_dir, 'no-mode.json');
    await writeFile(file, JSON.stringify({ permissions: { allow: [], deny: [], ask: [] } }), 'utf8');
    const session = ['-p', 'hi', '--output-format', 'stream-json', '--model', 'gemini-3.8-flash-low'];
    const ran = spawnSync(process.execPath, [FAKE_AGY, ...session, '--settings', file], {
      cwd: world.plot,
      env: minimalEnv(),
      encoding: 'utf8',
    });
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('Elvaria runs agy in Default ("agentMode": "")');
  });
});

describe('settleAll', () => {
  it('lets every write land before it throws the first refusal, so the clean-up after it finds them all', async () => {
    let landed = false;
    const slow = new Promise<void>((resolve) => {
      setTimeout(() => {
        landed = true;
        resolve();
      }, 50);
    });
    const refused = Promise.reject(new Error('hooks.json belongs to the territory'));
    await expect(settleAll([refused, slow])).rejects.toThrow('belongs to the territory');
    expect(landed).toBe(true);
  });

  it('resolves when every write does', async () => {
    await expect(settleAll([Promise.resolve(), Promise.resolve('x')])).resolves.toBeUndefined();
  });
});

describe('removeRunFiles', () => {
  it("takes only Elvaria's files and is a no-op on a clean plot", async () => {
    await removeRunFiles(world.plot);
    await writeFile(inPlot('GEMINI.md'), '# The territory wrote this one\n', 'utf8');
    await removeRunFiles(world.plot);
    expect(generated()).toEqual([inPlot('GEMINI.md')]);
  });
});
