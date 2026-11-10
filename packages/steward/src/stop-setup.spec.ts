// A Steward stopped (Ctrl+C) while a plot's commands.setup runs (P1-49, (a) of P1-47): Plots.prepare gets the stop's
// signal, so the setup is killed instead of waited for (up to SETUP_TIMEOUT_MS for a `pnpm install`), the claim is
// given back, and no other quest is claimed in the tick the stop came in.
import { afterEach, describe, expect, it } from 'vitest';

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

describe("a plot's setup when the Steward stops (P1-49)", () => {
  it('is killed by the stop, its claim given back, and no other quest claimed after it', async () => {
    current = await bench();
    const signals: AbortSignal[] = [];
    let started: () => void = () => undefined;
    const setupRuns = new Promise<void>((resolve) => {
      started = resolve;
    });
    // A setup that runs until its signal kills it, as runSetup's program does.
    const hanging = plotsWith(current.root, {
      prepare: (_quest, _territory, options) =>
        new Promise((_resolve, reject) => {
          const { signal } = options ?? {};
          if (signal === undefined) return;
          signals.push(signal);
          signal.addEventListener('abort', () => {
            reject(new Error('commands.setup: stopped before its end'));
          });
          started();
        }),
    });
    running = current.steward({ plots: hanging });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Slow install'));
    await current.command('create_quest', questPayload('Next in line'));

    const tick = running.tick();
    await setupRuns;
    await running.stop();
    running = undefined;
    await tick;

    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(true);
    const statuses = (await current.quests()).map(({ title, status }) => [title, status]).sort();
    expect(statuses).toEqual([
      ['Next in line', 'open'],
      ['Slow install', 'open'],
    ]);
    expect(current.warnings.join('\n')).toContain('stopped before its end');
  });
});
