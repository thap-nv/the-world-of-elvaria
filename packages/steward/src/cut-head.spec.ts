// The branch tip a cut is measured against (F of phase 2): read before the CLI starts, so a commit it makes at once
// counts; and a tip git could not name then is no baseline, so a later look cannot read an old commit as new.
import { afterEach, describe, expect, it } from 'vitest';

import { CLEAN } from './__fixtures__/cuts.ts';
import { bench, questPayload } from './__fixtures__/kingdom.ts';
import { plotsWith } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const HARD = 67.5;

/** `before` is the tip until the CLI spawns, `after` from then on; a `before` of null is a look that fails. */
async function cutWith(before: string | null, after: string) {
  current = await bench({ plays: { work: { Cut: ['hang', 'hang'] as const } } });
  const kingdom = current;
  let spawned = false;
  const claude = kingdom.runners.claude;
  const runners = {
    claude: {
      ...claude,
      spawn: (req: Parameters<typeof claude.spawn>[0]) => {
        spawned = true;
        return claude.spawn(req);
      },
    },
    gemini: kingdom.runners.gemini,
  };
  const head = () => {
    if (spawned) return Promise.resolve(after);
    return before === null ? Promise.reject(new Error('git is busy')) : Promise.resolve(before);
  };
  const plots = plotsWith(kingdom.root, { head, commit: () => Promise.resolve(CLEAN) });
  running = kingdom.steward({ runners, plots });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command('create_quest', questPayload('Cut'));
  await running.tick();
  kingdom.clock.advance(HARD);
  await running.tick();
  return kingdom.quest('Cut');
}

describe('the tip a cut is measured against', () => {
  it('counts a commit the CLI made as it started', async () => {
    const quest = await cutWith('old', 'new');
    expect(quest.attempt_log).toMatchObject([{ progress: true }]);
  });

  it('is no progress when the tip at the start is unknown and a later look reads a commit', async () => {
    const quest = await cutWith(null, 'old');
    expect(quest.attempt_log).toMatchObject([{ progress: false }]);
  });
});
