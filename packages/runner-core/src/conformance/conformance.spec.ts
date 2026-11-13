import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFakeRunner } from '../runner/fake-runner.ts';
import { CONFORMANCE_CHECKS, conformanceChecks, runConformance } from './checks.ts';
import { FAKE_SCENARIOS } from './scenarios.ts';
import { SPAWN_PROBE_FAILED, SPAWN_PROBE_OUT } from './spawn-probe.ts';
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
    expect(live).toEqual([
      'capabilities',
      'doctor',
      'probe',
      'submit',
      'hang',
      'forbidden_command',
      'spawn_child',
    ]);
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
    expect(failed).toEqual([
      'crash',
      'hang',
      'rate_limit',
      'forbidden_command',
      'spawn_child',
      'scratch_commit',
      'ask',
    ]);
    expect(reports.find(({ id }) => id === 'forbidden_command')?.problem).toContain(
      '`git push` was not refused',
    );
    // A session that never runs the probe (P1-12e).
    expect(reports.find(({ id }) => id === 'spawn_child')?.problem).toContain(
      'did not run `node elvaria-spawn-probe.mjs`',
    );
    // A judge in its scratch plot that keeps what it broke on a commit (P1-20).
    expect(reports.find(({ id }) => id === 'scratch_commit')?.problem).toContain('ran git commit');
  });

  it('fails a runner whose session runs a command but not the child it starts (P1-12e)', async () => {
    // As Codex 0.167's unelevated sandbox did on Windows: the probe ran, its piped child did not.
    const inner = createFakeRunner({ scenarioOf: () => 'submit' });
    const sandboxed: ConformanceTarget = {
      name: 'sandboxed',
      createRunner: (): AgentRunner => ({
        ...inner,
        spawn: async (req) => {
          await writeFile(path.join(req.cwd, SPAWN_PROBE_OUT), `${SPAWN_PROBE_FAILED}EPERM`);
          return inner.spawn(req);
        },
      }),
    };
    const check = CONFORMANCE_CHECKS.find(({ id }) => id === 'spawn_child');
    await expect(check?.run(sandboxed)).rejects.toThrow(
      /could not start a child process \(child failed: EPERM\)/,
    );
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

  it('fails a runner that declares no sign-in, or one Elvaria does not know (P1-19)', async () => {
    const problemOf = async (auth: readonly string[]) =>
      (await runConformance(fake({ capabilities: { auth: auth as never } }))).find(
        ({ id }) => id === 'capabilities',
      )?.problem;
    expect(await problemOf([])).toMatch(/^capability auth not declared/);
    expect(await problemOf(['login', 'oauth_device'])).toMatch(/^unknown auth oauth_device/);
  });

  it('passes a runner that names its shell per OS, and fails one whose shell is no name (P1-40)', async () => {
    const problemOf = async (shell: unknown) =>
      (await runConformance(fake({ capabilities: { shell: shell as never } }))).find(
        ({ id }) => id === 'capabilities',
      )?.problem;
    expect(await problemOf({ win32: 'Git Bash' })).toBeUndefined();
    expect(await problemOf({ win32: '' })).toMatch(/^capability shell is malformed/);
  });

  it('passes a runner that says whether its CLI searches, and fails one that says it otherwise (P1-53)', async () => {
    const problemOf = async (search: unknown) =>
      (await runConformance(fake({ capabilities: { search: search as never } }))).find(
        ({ id }) => id === 'capabilities',
      )?.problem;
    expect(await problemOf(false)).toBeUndefined();
    expect(await problemOf('no')).toMatch(/^capability search is malformed/);
  });

  it('passes a runner whose read and models are well formed, and fails one whose are not (PS-23)', async () => {
    const problemOf = async (capabilities: Record<string, unknown>) =>
      (await runConformance(fake({ capabilities }))).find(({ id }) => id === 'capabilities')?.problem;
    expect(await problemOf({ read: false, models: [{ id: 'auto' }] })).toBeUndefined();
    expect(await problemOf({ read: 'no' })).toMatch(/^capability read is malformed/);
    expect(await problemOf({ models: [{ id: 'Auto' }] })).toMatch(/^capability models is malformed/);
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
