// The attention item of a newer build (PS-08d): the repo the pinned build came from has commits on its default branch
// that touch the code since the pin; it can wait, and its command is `upgrade`. Apart from attention.spec.ts, which is
// at its size limit.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';

const NOW = Date.parse('2026-11-17T08:00:00+07:00') as Instant;
const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [],
  campaigns: CAMPAIGNS,
});
const PINNED = 'a'.repeat(40);
const LATEST = 'b'.repeat(40);

describe('attentionQueue with a newer build', () => {
  it('lists it in the group that can wait, with the commits since the pin and the upgrade command', () => {
    const items = attentionQueue(STATE, NOW, { upgrade: { pinned: PINNED, latest: LATEST, commits: 3 } });
    expect(items).toEqual([
      {
        kind: 'upgrade_available',
        group: 'can_wait',
        advice: 'upgrade',
        command: ['upgrade'],
        pinned: PINNED,
        latest: LATEST,
        commits: 3,
      },
    ]);
  });

  it('lists nothing without one', () => {
    expect(attentionQueue(STATE, NOW, {})).toEqual([]);
  });
});
