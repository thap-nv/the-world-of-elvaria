// What each check of the suite spent (run (221) (b)): the tokens its sessions reported, which `elvaria tribe check`
// says and records for the mana estimate.
import { describe, expect, it } from 'vitest';

import { createFakeRunner } from '../runner/fake-runner.ts';
import { runConformance } from './run.ts';
import type { FakeRunnerOptions } from '../runner/fake-runner.ts';
import type { ConformanceTarget } from './target.ts';

const fake = (options: FakeRunnerOptions = {}): ConformanceTarget => ({
  name: 'FakeRunner',
  createRunner: () => createFakeRunner(options),
});

describe('runConformance', () => {
  it("reports what each check's sessions spent, passed or failed, and 0 for a check that opens none", async () => {
    // Every session submits at 300 tokens: most checks fail on it, and their tokens are spent all the same.
    const told: number[] = [];
    const target = {
      ...fake({ scenarioOf: () => 'submit', tokens: 300 }),
      onSpent: (n: number) => told.push(n),
    };
    const reports = await runConformance(target);
    expect(reports.map(({ id, outcome, tokens }) => [id, outcome, tokens])).toEqual([
      ['capabilities', 'passed', 0],
      ['doctor', 'passed', 0],
      ['probe', 'passed', 0],
      ['submit', 'passed', 300],
      ['crash', 'failed', 300],
      ['hang', 'failed', 300],
      ['rate_limit', 'failed', 300],
      ['forbidden_command', 'failed', 300],
      ['spawn_child', 'failed', 300],
      ['structured', 'failed', 300],
      ['image', 'skipped', 0],
      ['scratch_commit', 'failed', 300],
      ['ask', 'failed', 300],
    ]);
    // The target hears of each session too, once.
    expect(told).toHaveLength(9);
  });
});
