import { CheckIdSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { createBackground, wantedIn } from './background.ts';
import type { Quest, QuestId, VerdictCheck } from '@elvaria/domain';

const Q1 = 'q_20261107_aaaaaa' as QuestId;
const Q2 = 'q_20261107_bbbbbb' as QuestId;
const Q3 = 'q_20261107_cccccc' as QuestId;
const UNIT: VerdictCheck = { id: CheckIdSchema.parse('unit'), pass: true, duration_ms: 1, log_path: 'x' };

const waiting = (): { promise: Promise<void>; end: () => void } => {
  let end = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    end = resolve;
  });
  return { promise, end };
};

describe('createBackground', () => {
  it('keeps ended checks for the run they were for, once, and forgets work that threw', async () => {
    const warnings: string[] = [];
    const background = createBackground({ warn: (message) => void warnings.push(message) });
    const gate = waiting();
    background.checks(Q1, 2, async () => {
      await gate.promise;
      return [UNIT];
    });
    // Started once: a second start while it runs is no second run.
    background.checks(Q1, 2, () => Promise.reject(new Error('never')));
    background.script(Q2, 1, () => Promise.reject(new Error('node is gone')));
    expect(background.view()).toEqual({ running: [Q1, Q2], checked: [] });
    gate.end();
    await background.idle();
    expect(background.view()).toEqual({ running: [], checked: [Q1] });
    expect(warnings).toEqual([`steward: ${Q2}: its script stopped: node is gone`]);
    expect(background.take(Q1, 1)).toBeUndefined();
    expect(background.take(Q1, 2)).toEqual([UNIT]);
    expect(background.take(Q1, 2)).toBeUndefined();
  });

  it('says when work ended on its own, its result already kept, and not for work it aborted (P1-10b)', async () => {
    const seen: string[] = [];
    const background = createBackground({ warn: () => undefined }, () => {
      seen.push(`ended, checked ${background.view().checked.join(',')}`);
    });
    const gate = waiting();
    background.checks(Q1, 1, async () => {
      await gate.promise;
      return [UNIT];
    });
    background.script(Q2, 1, () => Promise.reject(new Error('node is gone')));
    background.checks(Q3, 1, (signal) => {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          resolve([UNIT]);
        });
      });
    });
    background.prune((quest) => quest !== Q3);
    await Promise.resolve();
    gate.end();
    await background.idle();
    // The script that threw ended on its own too: its quest is the next tick's to release.
    expect(seen).toEqual(['ended, checked ', `ended, checked ${Q1}`]);
  });

  it('aborts the work it prunes and keeps nothing it gives back afterwards', async () => {
    const background = createBackground({ warn: () => undefined });
    const seen: AbortSignal[] = [];
    background.checks(Q1, 1, (signal) => {
      seen.push(signal);
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          resolve([UNIT]);
        });
      });
    });
    background.prune((quest, kind, n) => quest !== Q1 || kind !== 'checks' || n !== 1);
    await background.idle();
    expect(seen[0]?.aborted).toBe(true);
    expect(background.view()).toEqual({ running: [], checked: [] });
  });
});

describe('wantedIn', () => {
  const quest = (status: Quest['status'], verifier: string | null = null) =>
    ({ id: Q1, status, verifier, attempt_log: [{ n: 1, role: 'assignee' }] }) as unknown as Quest;
  const wanted = (held: Quest | undefined) => wantedIn(new Map(held === undefined ? [] : [[Q1, held]]));

  it('wants checks while the quest waits for a judge, and a script while it works, on the same run', () => {
    expect(wanted(quest('review'))(Q1, 'checks', 1)).toBe(true);
    expect(wanted(quest('review', 'sable'))(Q1, 'checks', 1)).toBe(false);
    expect(wanted(quest('review'))(Q1, 'checks', 2)).toBe(false);
    expect(wanted(quest('working'))(Q1, 'script', 1)).toBe(true);
    expect(wanted(quest('archived'))(Q1, 'script', 1)).toBe(false);
    expect(wanted(undefined)(Q1, 'script', 1)).toBe(false);
  });
});
