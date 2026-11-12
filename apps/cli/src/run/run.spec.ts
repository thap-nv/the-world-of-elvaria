import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { SELF_ROOT } from '../upgrade/self.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria run', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const steward = (io = testIo()) => run(io, 'run', '--kingdom', kingdom, '--locale', 'en');

  it('starts the Steward with a runner per tribe that has an adapter, and stops it when told', async () => {
    const io = testIo();
    expect(await steward(io)).toBe(0);
    expect(io.printed.out).toEqual([
      'Tribe claude: adapter claude_code ready.',
      // Antigravity has a runner since P1-15; a tribe without one is in compose.spec.ts (crewOf).
      'Tribe gemini: adapter antigravity ready.',
      // The specs run on the repo's own source, not on a pinned build (PS-04b).
      `Running from the source at ${SELF_ROOT}, not from a pinned build.`,
      `The Steward is running in ${kingdom}, one tick every 5 s. Ctrl+C stops it.`,
      'Stopping the Steward: the sessions it runs end, and their quests are taken up again at the next start.',
      'The Steward stopped.',
    ]);
    // The lock went with it: the next Steward starts.
    expect(await steward()).toBe(0);
  });

  it('refuses a second Steward on the same kingdom', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = testIo({ untilStopped: () => held });
    const running = steward(first);
    // Wait until the first Steward holds the lock.
    while (!first.printed.out.some((line) => line.startsWith('The Steward is running'))) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const second = testIo();
    expect(await steward(second)).toBe(1);
    expect(second.printed.err).toEqual([
      `Another Steward is already running in ${kingdom}: one kingdom has one Steward.`,
    ]);
    release();
    expect(await running).toBe(0);
  });

  it('builds no runner for a disabled tribe, and says nothing of it', async () => {
    const file = path.join(kingdom, 'kingdom.json');
    const saved = KingdomSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    const tribes = saved.tribes.map((tribe) => ({ ...tribe, enabled: tribe.id === 'claude' }));
    await writeFile(file, JSON.stringify({ ...saved, tribes }));
    const io = testIo();
    expect(await steward(io)).toBe(0);
    expect(printed(io)).not.toContain('gemini');
  });

  it('needs a kingdom', async () => {
    const io = testIo({ env: {} });
    expect(await run(io, 'run', '--locale', 'en')).toBe(1);
    expect(io.printed.err).toEqual([expect.stringContaining('--kingdom') as string]);
  });
});
