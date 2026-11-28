import { writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFakeRunner } from '../runner/fake-runner.ts';
import { CONFORMANCE_CHECKS, conformanceChecks } from './checks.ts';
import { runConformance } from './run.ts';
import { FAKE_IMAGE_FILE, FAKE_IMAGE_SCHEMA } from './image-probe.ts';
import { FAKE_SCENARIOS, FAKE_STRUCTURED_ANSWER, FAKE_STRUCTURED_SCHEMA } from './scenarios.ts';
import { SPAWN_PROBE_FAILED, SPAWN_PROBE_OUT } from './spawn-probe.ts';
import { stripesPng } from './stripes.ts';
import { conformanceRequest } from './workspace.ts';
import type { FakeRunnerOptions } from '../runner/fake-runner.ts';
import type { AgentRunner, SpawnRequest } from '../runner/types.ts';
import type { ConformanceTarget } from './target.ts';

const fake = (options: FakeRunnerOptions = {}, name = 'FakeRunner'): ConformanceTarget => ({
  name,
  createRunner: () => createFakeRunner(options),
});

// The suite every adapter runs (implementation-plan §3.14): here against FakeRunner, as each adapter's spec will
// run it against its fake CLI, and against the real CLI with ELVARIA_LIVE=1.
describe('conformance suite: FakeRunner', () => {
  // A tribe that reads images, so the image probe plays too (PS-11b).
  const target = fake({ capabilities: { vision: true } });
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
      'secret_place',
      'read_only_write',
      'spawn_child',
      'structured',
      'image',
    ]);
  });

  it('skips what a runner does not claim', async () => {
    const reports = await runConformance(
      fake({ capabilities: { tool_gate: false, usage: false, structured_output: false } }),
    );
    expect(reports.filter(({ outcome }) => outcome !== 'passed')).toEqual([
      { id: 'rate_limit', outcome: 'skipped', tokens: 0 },
      { id: 'forbidden_command', outcome: 'skipped', tokens: 0 },
      { id: 'secret_place', outcome: 'skipped', tokens: 0 },
      { id: 'read_only_write', outcome: 'skipped', tokens: 0 },
      { id: 'structured', outcome: 'skipped', tokens: 0 },
      { id: 'image', outcome: 'skipped', tokens: 0 },
      { id: 'scratch_commit', outcome: 'skipped', tokens: 0 },
    ]);
  });

  it('asks a judge to name the stripes of the one image its policy opens, outside its plot (PS-11b)', () => {
    const runner = createFakeRunner({ capabilities: { vision: true } });
    const workspace = { root: 'k', plot: 'p', run_dir: 'r', handover: 'h', remove: () => Promise.resolve() };
    const req = conformanceRequest(workspace, 'image', runner, fake());
    const image = path.join('r', 'screens', FAKE_IMAGE_FILE);
    expect(req).toMatchObject({ role: 'verifier', structured: FAKE_IMAGE_SCHEMA });
    expect(req.permissions.images).toEqual([image]);
    expect(req.prompt.user).toContain(image);
    expect(req.handover).toBeUndefined();
  });

  /** A runner that reads images, whose sessions get `change` applied to their request first. */
  const changing = (change: (req: SpawnRequest) => SpawnRequest): ConformanceTarget => {
    const inner = createFakeRunner({ capabilities: { vision: true } });
    return {
      name: 'changing',
      createRunner: (): AgentRunner => ({ ...inner, spawn: (req) => inner.spawn(change(req)) }),
    };
  };

  it('fails a runner that declares vision but whose judge cannot open the image (PS-11b)', async () => {
    const check = CONFORMANCE_CHECKS.find(({ id }) => id === 'image');
    const closed = changing((req) => ({ ...req, permissions: { ...req.permissions, images: [] } }));
    await expect(check?.run(closed)).rejects.toThrow(/could not open the one image its policy opens/);
  });

  it('fails a runner whose judge names the stripes in another order (PS-11b)', async () => {
    const check = CONFORMANCE_CHECKS.find(({ id }) => id === 'image');
    // Another image of stripes, which the policy opens in place of the probe's: a judge that saw something else.
    const other = changing((req) => {
      const [image = ''] = req.permissions.images ?? [];
      const elsewhere = path.join(path.dirname(image), 'other.png');
      writeFileSync(elsewhere, stripesPng(['red', 'red', 'red', 'red'], 64, 4));
      return { ...req, permissions: { ...req.permissions, images: [elsewhere] } };
    });
    await expect(check?.run(other)).rejects.toThrow(/it did not see the image/);
  });

  it('fails a runner that hands back null for a key the schema leaves optional (fix/codex-output-schema)', async () => {
    // As runner-codex did before: Codex's strict output fills every key, null for those left out.
    const inner = createFakeRunner();
    const nulls: ConformanceTarget = {
      name: 'nulls',
      createRunner: (): AgentRunner => ({
        ...inner,
        spawn: async (req) => {
          const session = await inner.spawn(req);
          const wait = async () => {
            const result = await session.wait();
            return { ...result, structured: { ...FAKE_STRUCTURED_ANSWER, fail_kind: null, breaks: null } };
          };
          return { ...session, wait };
        },
      }),
    };
    const check = CONFORMANCE_CHECKS.find(({ id }) => id === 'structured');
    await expect(check?.run(nulls)).rejects.toThrow(/a key the schema leaves optional came back null/);
  });

  it('asks a judge for its verdict with the schema and no letter, as the Steward does', () => {
    const runner = createFakeRunner();
    const workspace = { root: 'k', plot: 'p', run_dir: 'r', handover: 'h', remove: () => Promise.resolve() };
    const req = conformanceRequest(workspace, 'structured', runner, fake());
    expect(req).toMatchObject({ role: 'verifier', structured: FAKE_STRUCTURED_SCHEMA });
    expect(req.handover).toBeUndefined();
    expect(req.prompt.system).not.toContain('handover');
    expect(req.permissions.tools).not.toContain('Edit');
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
      'secret_place',
      'read_only_write',
      'spawn_child',
      'structured',
      'scratch_commit',
      'ask',
    ]);
    expect(reports.find(({ id }) => id === 'structured')?.problem).toContain('gave no structured answer');
    expect(reports.find(({ id }) => id === 'forbidden_command')?.problem).toContain(
      '`git push` was not refused',
    );
    expect(reports.find(({ id }) => id === 'secret_place')?.problem).toContain(
      '`git status --short -- ~/.codex/config.toml` was not refused',
    );
    // A "read-only" session whose gate never refused the write (P2-01d).
    expect(reports.find(({ id }) => id === 'read_only_write')?.problem).toContain(
      'the write of probe-source.ts was not refused',
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
      fake({ capabilities: { headless: false }, probe: { status: 'error', cli_text: 'not logged in' } }),
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

  it('passes a runner that declares a prompt limit per OS, and fails one whose limit is no number', async () => {
    const problemOf = async (limits: unknown) =>
      (await runConformance(fake({ capabilities: { prompt_max_chars: limits as never } }))).find(
        ({ id }) => id === 'capabilities',
      )?.problem;
    expect(await problemOf({ win32: 28_000 })).toBeUndefined();
    expect(await problemOf({ win32: -1 })).toMatch(/^capability prompt_max_chars is malformed/);
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
    // PS-11: whether the CLI reads images.
    expect(await problemOf({ vision: true })).toBeUndefined();
    expect(await problemOf({ vision: 'png' })).toMatch(/^capability vision is malformed/);
    // PS-27: whether it runs the tribe's CLI in its config folder.
    expect(await problemOf({ config_dir: true })).toBeUndefined();
    expect(await problemOf({ config_dir: 'C:/accounts' })).toMatch(/^capability config_dir is malformed/);
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
      tokens: 0,
    });
    expect(reports.find(({ id }) => id === 'submit')).toEqual({
      id: 'submit',
      outcome: 'failed',
      problem: 'spawn failed',
      tokens: 0,
    });
  });

  it('gives up on a session that never answers', async () => {
    const reports = await runConformance({ ...fake({ scenarioOf: () => 'hang' }), timeout_ms: 50 });
    expect(reports.find(({ id }) => id === 'submit')?.problem).toBe('submit: wait: no answer within 50 ms');
  });
});
