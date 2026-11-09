import { describe, expect, it } from 'vitest';

import { createFakeRunner } from '../runner/fake-runner.ts';
import { CONFORMANCE_CHECKS, conformanceChecks, runConformance } from './checks.ts';
import { FAKE_SCENARIOS } from './scenarios.ts';
import type { FakeRunnerOptions } from '../runner/fake-runner.ts';
import type { AgentRunner } from '../runner/types.ts';
import type { ConformanceTarget } from './target.ts';

const fake = (options: FakeRunnerOptions = {}, name = 'FakeRunner'): ConformanceTarget => ({
  name,
  createRunner: () => createFakeRunner(options),
});

// The suite every adapter runs (implementation-plan §3.14): here against FakeRunner, as each adapter's spec will
// run it against its fake CLI, and against the real CLI with ELVARIA_LIVE=1.
describe('conformance suite: FakeRunner', () => {
  const target = fake();
  for (const check of conformanceChecks(target)) {
    it(check.id, async () => {
      expect(await check.run(target)).toBe('passed');
    });
  }
});

describe('the conformance suite', () => {
  it('plays every fake scenario and covers the runner calls', () => {
    const ids = CONFORMANCE_CHECKS.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining([...FAKE_SCENARIOS, 'capabilities', 'doctor', 'probe']));
  });

  it('keeps to the checks that burn no mana with a real CLI (§10 question 5)', () => {
    const live = conformanceChecks({ ...fake(), live: true }).map(({ id }) => id);
    expect(live).toEqual(['capabilities', 'doctor', 'probe', 'submit', 'hang', 'forbidden_command']);
  });

  it('skips what a runner does not claim', async () => {
    const reports = await runConformance(fake({ capabilities: { tool_gate: false, usage: false } }));
    expect(reports.filter(({ outcome }) => outcome !== 'passed')).toEqual([
      { id: 'rate_limit', outcome: 'skipped' },
      { id: 'forbidden_command', outcome: 'skipped' },
      { id: 'scratch_commit', outcome: 'skipped' },
    ]);
  });

  it('fails a runner whose behaviour does not match its claims', async () => {
    // Every session submits: it never crashes, never asks, and its "tool gate" lets the push through.
    const reports = await runConformance(fake({ scenarioOf: () => 'submit' }, 'liar'));
    const failed = reports.filter(({ outcome }) => outcome === 'failed').map(({ id }) => id);
    expect(failed).toEqual(['crash', 'hang', 'rate_limit', 'forbidden_command', 'scratch_commit', 'ask']);
    expect(reports.find(({ id }) => id === 'forbidden_command')?.problem).toContain(
      '`git push` was not refused',
    );
    // A judge in its scratch plot that keeps what it broke on a commit (P1-20).
    expect(reports.find(({ id }) => id === 'scratch_commit')?.problem).toContain('ran git commit');
  });

  it('refuses commit and push to a judge in its scratch plot, though its class allows both (P1-20)', async () => {
    const check = CONFORMANCE_CHECKS.find(({ id }) => id === 'scratch_commit');
    expect(await check?.run(fake())).toBe('passed');
  });

  it('fails a runner that cannot run headless, or whose probe fails', async () => {
    const reports = await runConformance(
      fake({ capabilities: { headless: false }, probe: { status: 'error', detail: 'not logged in' } }),
    );
    expect(
      reports.filter(({ outcome }) => outcome === 'failed').map(({ id, problem }) => [id, problem]),
    ).toEqual([
      ['capabilities', expect.stringMatching(/^headless is required/)],
      ['probe', 'probe failed: not logged in'],
    ]);
  });

  it('reports a runner that throws instead of answering', async () => {
    const broken: ConformanceTarget = {
      name: 'broken',
      createRunner: (): AgentRunner => ({
        ...createFakeRunner(),
        doctor: () => Promise.reject(new Error('no CLI on PATH')),
        spawn: () => Promise.reject(new Error('spawn failed')),
      }),
    };
    const reports = await runConformance(broken);
    expect(reports.find(({ id }) => id === 'doctor')).toEqual({
      id: 'doctor',
      outcome: 'failed',
      problem: 'no CLI on PATH',
    });
    expect(reports.find(({ id }) => id === 'submit')).toEqual({
      id: 'submit',
      outcome: 'failed',
      problem: 'spawn failed',
    });
  });

  it('gives up on a session that never answers', async () => {
    const reports = await runConformance({ ...fake({ scenarioOf: () => 'hang' }), timeout_ms: 50 });
    expect(reports.find(({ id }) => id === 'submit')?.problem).toBe('submit: wait: no answer within 50 ms');
  });
});
