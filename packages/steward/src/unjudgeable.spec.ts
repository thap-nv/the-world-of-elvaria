// A submitted quest whose judge the roster does not have (P1-15): dispatch.verifier_same_family = different_model
// (the default) and the only judge works on the assignee's own model.
import { afterEach, describe, expect, it } from 'vitest';

import { bench, characterOf, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
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

/** thorn (Sonnet) does the work; vesper judges on Sonnet too, so it may never judge thorn's quest. */
async function open() {
  current = await bench({
    cast: [
      { id: 'thorn', cls: 'knight', level: 5 },
      { id: 'vesper', cls: 'judge', model: 'claude-sonnet-5-5' },
    ],
  });
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const rung = (kingdom: Bench) => kingdom.notices.filter(({ kind }) => kind === 'unjudgeable');

describe('a submitted quest no judge of the roster may take', () => {
  it('rings once while it waits, then goes on with the judge the owner summons', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Nobody judges'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Nobody judges', 'review'));
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    const quest = await kingdom.quest('Nobody judges');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    expect(rung(kingdom)).toEqual([
      {
        kind: 'unjudgeable',
        quest: { id: quest.id, title: 'Nobody judges', rank: 'D' },
        classes: ['judge'],
        model: 'claude-sonnet-5-5',
      },
    ]);
    // The owner summons a judge on another model: the review goes on, and the bell has nothing more to say.
    await kingdom.store.characters.write(
      characterOf({ id: 'sable', cls: 'judge', model: 'claude-opus-5-5' }),
    );
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Nobody judges', 'done'));
    expect(rung(kingdom)).toHaveLength(1);
  });
});
