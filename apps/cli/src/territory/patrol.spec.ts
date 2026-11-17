// `elvaria territory patrol` (PS-26): prints whether the daily patrol watches a territory, writes or removes
// territory.patrol as `territory delivery` writes its field (ADR 0005 exception), keeps scans and follow_up on --on.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria territory patrol', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const repo = await gitRepo(path.join(dir.root, 'repo elvaria'));
    const io = testIo();
    if ((await run(io, 'territory', 'add', repo, '--id', 'elvaria', '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  });
  afterEach(() => dir.remove());

  const fileOf = () => path.join(kingdom, 'territories', 'elvaria', 'territory.json');
  const read = async () => JSON.parse(await readFile(fileOf(), 'utf8')) as Record<string, unknown>;
  const patrol = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, 'territory', 'patrol', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };

  it('prints a territory not patrolled, and that the kingdom’s patrol is off', async () => {
    const { code, text } = await patrol('elvaria');
    expect(code).toBe(0);
    expect(text).toContain('Territory elvaria: not patrolled.');
    expect(text).toContain("The kingdom's patrol is off");
    expect(await read()).not.toHaveProperty('patrol');
  });

  it('--on writes the flag and keeps scans and follow_up already there; --off removes it all', async () => {
    const on = await patrol('elvaria', '--on');
    expect(on.code).toBe(0);
    expect(on.text).toContain('Territory elvaria: patrolled.');
    expect(on.text).toContain('Scans: none.');
    expect(on.text).toContain('a digest item only');
    expect(on.text).toContain('Written to territory.json');
    expect((await read()).patrol).toEqual({ scans: [] });
    const scans = [{ script: 'link-check', params: { globs: ['docs/**/*.md'] } }];
    const followUp = { kind: 'fix', rank: 'D', class: 'knight' };
    await writeFile(fileOf(), JSON.stringify({ ...(await read()), patrol: { scans, follow_up: followUp } }));
    const again = await patrol('elvaria', '--on');
    expect(again.text).toContain('Scans: link-check.');
    expect(again.text).toContain('kind fix, rank D, class knight');
    expect((await read()).patrol).toEqual({ scans, follow_up: followUp });
    const off = await patrol('elvaria', '--off');
    expect(off.text).toContain('Territory elvaria: not patrolled.');
    expect(await read()).not.toHaveProperty('patrol');
  });

  it('prints the kingdom’s schedule when it is on, and refuses --on with --off or an unknown territory', async () => {
    const settings = path.join(kingdom, 'kingdom.json');
    const json = JSON.parse(await readFile(settings, 'utf8')) as { schedule?: Record<string, unknown> };
    const schedule = { ...json.schedule, patrol: { enabled: true, at: '06:30', every: 'P7D' } };
    await writeFile(settings, JSON.stringify({ ...json, schedule }));
    expect((await patrol('elvaria')).text).toContain("The kingdom's schedule: every P7D, at 06:30.");
    expect((await patrol('elvaria', '--on', '--off')).code).toBe(2);
    const unknown = await patrol('nowhere');
    expect(unknown.code).toBe(1);
    expect(unknown.text).toContain('No territory nowhere.');
  });
});
