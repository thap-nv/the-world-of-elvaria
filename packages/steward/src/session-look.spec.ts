// A tribe's look is display only (ADR 0025, PS-24): the same quest, worked and judged in a kingdom whose tribes carry
// the owner's looks, opens the same sessions with the same prompts, byte for byte, as in a kingdom without them.
import { ok } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { TribeLookChoice } from '@elvaria/domain';

const benches: Bench[] = [];
const stewards: Steward[] = [];

afterEach(async () => {
  for (const steward of stewards.splice(0)) await steward.stop();
  for (const done of benches.splice(0)) await done.remove();
});

/** claude and gemini swap the theme's looks, with names of the owner's. */
const SWAPPED: Readonly<Record<string, TribeLookChoice>> = {
  claude: {
    palette: 'red',
    crest: 'fire',
    figure: 'sturdy',
    aura: 'sparks',
    frame: 'shield',
    name: 'Lửa Đỏ',
  },
  gemini: {
    palette: 'silver',
    crest: 'star',
    figure: 'slender',
    aura: 'glow',
    frame: 'round',
    name: 'Sao Bạc',
  },
};

/** Who worked and judged the quest, and every prompt they got, the bench's folder written as `<kingdom>`. */
async function judged(looks: boolean) {
  const current = await bench({
    cast: [
      { id: 'kael', cls: 'knight' },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ],
  });
  benches.push(current);
  if (looks) {
    const saved = await current.store.kingdom.update((kingdom) =>
      ok({ ...kingdom, tribes: kingdom.tribes.map((tribe) => ({ ...tribe, look: SWAPPED[tribe.id] })) }),
    );
    expect(saved.ok).toBe(true);
  }
  const running = current.steward();
  stewards.push(running);
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Looks apart'));
  await tickUntil(running, current.clock, statusIs(current, 'Looks apart', 'done'));
  const roots = [current.root, current.root.replaceAll('\\', '/')];
  const plain = (text: string) => roots.reduce((out, root) => out.replaceAll(root, '<kingdom>'), text);
  return current.requests.map((req) => ({
    role: req.role,
    character: req.character.id,
    system: plain(req.prompt.system),
    user: plain(req.prompt.user),
  }));
}

describe('a tribe look never reaches a prompt', () => {
  it('gives the worker and the judge the same prompts whatever look their tribes wear', async () => {
    const without = await judged(false);
    const looked = await judged(true);
    expect(without.map(({ role, character }) => `${role}:${character}`)).toEqual([
      'assignee:kael',
      'verifier:orin',
    ]);
    expect(looked).toEqual(without);
    for (const { system, user } of looked) {
      expect(`${system}\n${user}`).not.toMatch(/Lửa Đỏ|Sao Bạc/);
    }
  });
});
