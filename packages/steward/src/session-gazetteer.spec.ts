// The gazetteer's freshness in a session's prompt (PS-21): a stamped gazetteer is quoted without its stamp and with
// how many commits touched each top-level folder since, from the plots' `drift`; one git cannot read costs the note;
// a gazetteer without a stamp reaches the prompt as it is, and `drift` is not asked.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import { folderPlots } from './plots.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';
import type { Drift } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const SHA = '43566818d835f9acb3c24e8b2acffbfe90133284';
const BODY = '# dc1\n\nThe API lives in apps/api.';

/** The assignee's prompt (user part) of a quest on dc1-se-team, with `gazetteer` and the plots' `drift`. */
async function promptWith(gazetteer: string, drift: () => Promise<Drift | null>) {
  current = await bench({
    cast: [
      { id: 'kael', cls: 'knight' },
      { id: 'ilse', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ],
  });
  await writeFile(path.join(current.root, 'territories', 'dc1-se-team', 'gazetteer.md'), gazetteer);
  const asked: string[] = [];
  const plots: Plots = {
    ...folderPlots(current.root),
    drift: (_plot, from) => {
      asked.push(from);
      return drift();
    },
  };
  running = current.steward({ plots });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Gazetteer words'));
  await tickUntil(running, current.clock, statusIs(current, 'Gazetteer words', 'done'));
  const assignee = current.requests.find((req) => req.role === 'assignee');
  if (assignee === undefined) throw new Error('no assignee request');
  return { user: assignee.prompt.user, asked, warnings: current.warnings };
}

describe('a stamped gazetteer (PS-21)', () => {
  it('reaches the prompt without its stamp, with the folders that moved since', async () => {
    const { user, asked } = await promptWith(`<!-- elvaria:commit ${SHA} -->\n${BODY}\n`, () =>
      Promise.resolve({ apps: 12, packages: 3 }),
    );
    expect(asked[0]).toBe(SHA);
    expect(user).toContain(
      `${BODY}\n\nSince this gazetteer was written at \`43566818d835\`, 12 commits touched \`apps/\`, 3 touched \`packages/\`: check what it says of them against the code.`,
    );
    expect(user).not.toContain('elvaria:commit');
  });

  it('loses only the note when git cannot say, or when reading the drift fails', async () => {
    const quiet = await promptWith(`<!-- elvaria:commit ${SHA} -->\n${BODY}\n`, () => Promise.resolve(null));
    expect(quiet.user).toContain(BODY);
    expect(quiet.user).not.toContain('Since this gazetteer');
    await running?.stop();
    await current?.remove();
    const broken = await promptWith(`<!-- elvaria:commit ${SHA} -->\n${BODY}\n`, () =>
      Promise.reject(new Error('git is not found')),
    );
    expect(broken.user).toContain(BODY);
    expect(broken.user).not.toContain('elvaria:commit');
    expect(broken.warnings.some((line) => line.includes('no drift of the gazetteer: git is not found'))).toBe(
      true,
    );
  });
});

describe('a gazetteer without a stamp (PS-21)', () => {
  it('reaches the prompt as it is, and the drift is not asked', async () => {
    const { user, asked } = await promptWith(`${BODY}\n`, () => Promise.resolve({ apps: 1 }));
    expect(user).toContain(BODY);
    expect(user).not.toContain('Since this gazetteer');
    expect(asked).toEqual([]);
  });
});
