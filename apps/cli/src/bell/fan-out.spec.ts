// One bell that rings several (P2-03): a broken bell does not stop the others, nor the ring.
import { QuestIdSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { fanOut } from './fan-out.ts';
import type { Bell, Notice } from '@elvaria/steward';

const notice: Notice = {
  kind: 'awaiting_seal',
  quest: { id: QuestIdSchema.parse('q_20261127_fanx7d'), title: 'Fan out', rank: 'D' },
};

describe('a bell that rings several', () => {
  it('rings every bell, and reports the ones that throw or reject without failing', async () => {
    const heard: string[] = [];
    const failed: unknown[] = [];
    const listening = (name: string): Bell => ({
      ring: (rung) => {
        heard.push(`${name}:${rung.kind}`);
        return Promise.resolve();
      },
    });
    const throwing: Bell = {
      ring: () => {
        throw new Error('thrown');
      },
    };
    const rejecting: Bell = { ring: () => Promise.reject(new Error('rejected')) };
    const bell = fanOut([throwing, listening('console'), rejecting, listening('desktop')], (error) => {
      failed.push(error);
    });
    await expect(bell.ring(notice)).resolves.toBeUndefined();
    expect(heard).toEqual(['console:awaiting_seal', 'desktop:awaiting_seal']);
    expect(failed.map((error) => (error as Error).message)).toEqual(['thrown', 'rejected']);
  });
});
