// RC-02: a real git push must deliver its evidence to a real pre-push hook, including after a restart or retry.
import { currentRun, verdictIdOf } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { GREEN, moveBase, recordingHook, verdictAtHead } from '../__fixtures__/checked-head.ts';
import { delivered } from '../__fixtures__/deliver.ts';
import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { Steward } from '../types.ts';
import type { CheckRun } from '@elvaria/runner-core';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const TITLE = 'Checked rooms';
const ENVIRONMENT: CheckRun = { ...GREEN, pass: false, exit_code: 1, environment: 'Docker unavailable' };

async function beforeDelivery(bench: ForgeBench) {
  const plots = gitPlots(bench.kingdom.root);
  const steward = await bench.start({ plots: { ...plots, check: () => Promise.resolve([GREEN]) } });
  await bench.kingdom.command('create_quest', questPayload(TITLE));
  await tickUntil(steward, bench.kingdom.clock, delivered(bench.kingdom, TITLE));
  await steward.stop();
  const quest = await bench.kingdom.quest(TITLE);
  await verdictAtHead(bench, quest, 'pass');
  return quest;
}

async function pushed(bench: ForgeBench, steward: Steward) {
  await tickUntil(
    steward,
    bench.kingdom.clock,
    async () => (await bench.lines('delivery.pushed')).length > 0,
  );
  const [line] = await bench.lines('delivery.pushed');
  expect(line?.data.push_ms).toEqual(expect.any(Number));
  expect(line?.data.push_ms).toBeGreaterThanOrEqual(0);
  expect(await bench.lines('delivery.failed')).toEqual([]);
  return String(line?.data.head);
}

describe('the checked head seen by the territory hook', () => {
  it.each(['green', 'environment', 'empty'] as const)('queue run: %s', async (mode) => {
    current = await forgeBench({ delivery: { mode: 'pr' } });
    const bench = current;
    const quest = await beforeDelivery(bench);
    const oldHead = git(quest.plot.path ?? '', 'rev-parse', 'HEAD');
    await moveBase(bench);
    const readHook = await recordingHook(bench);
    const runs = mode === 'green' ? [GREEN] : mode === 'environment' ? [ENVIRONMENT] : [];
    const plots = gitPlots(bench.kingdom.root);
    const steward = await bench.start({ plots: { ...plots, check: () => Promise.resolve(runs) } });
    const head = await pushed(bench, steward);
    expect(head).not.toBe(oldHead);
    expect(await readHook()).toBe(`${mode === 'green' ? head : 'absent'}\n`);
    expect(bench.remoteTip(`quest/${quest.id}`)).toBe(head);
  });

  it.each(['pass', 'empty', 'old'] as const)('current branch after restart: verdict %s', async (mode) => {
    current = await forgeBench({ delivery: { mode: 'pr' } });
    const bench = current;
    const quest = await beforeDelivery(bench);
    await verdictAtHead(bench, quest, mode);
    const readHook = await recordingHook(bench);
    const head = await pushed(bench, await bench.start());
    expect(await readHook()).toBe(`${mode === 'pass' ? head : 'absent'}\n`);
  });

  it('does not use the old verdict when a failed push is delivered again after the base was merged', async () => {
    current = await forgeBench({ delivery: { mode: 'pr' } });
    const bench = current;
    const quest = await beforeDelivery(bench);
    await verdictAtHead(bench, quest, 'old');
    await moveBase(bench);
    const readHook = await recordingHook(bench, true);
    const plots = gitPlots(bench.kingdom.root);
    const first = await bench.start({ plots: { ...plots, check: () => Promise.resolve([GREEN]) } });
    await tickUntil(
      first,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.failed')).length > 0,
    );
    await first.stop();
    const merged = git(quest.plot.path ?? '', 'rev-parse', 'HEAD');
    const [failure] = await bench.lines('delivery.failed');
    expect(failure?.data).toMatchObject({ stage: 'push', reason: 'push_refused' });
    expect(bench.remoteTip(`quest/${quest.id}`)).toBe('');
    await bench.kingdom.command('deliver', { quest: quest.id });
    const second = await bench.start();
    await tickUntil(
      second,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.pushed')).length > 0,
    );
    expect(await readHook()).toBe(`${merged}\nabsent\n`);
    const [line] = await bench.lines('delivery.pushed');
    expect(line?.data).toMatchObject({ head: merged, push_ms: expect.any(Number) as unknown });
    const verdict = await bench.kingdom.store.verdicts.read(verdictIdOf(quest, currentRun(quest)));
    expect(verdict.ok && verdict.value.created_at).toBe('2000-01-01T00:00:00Z');
  });
});
