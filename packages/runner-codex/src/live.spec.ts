// Smoke runs against the real Codex CLI (ELVARIA_LIVE=1): they burn a little of the owner's Codex usage with the
// cheapest model (gpt-6-luna at low effort, spike Codex 2026-11-12 §2), so they run only on demand
// (.claude/rules/runner.md). The hook runs as in production, built: `node --conditions=elvaria-dist
// elvaria-hook.js`; run `pnpm --filter @elvaria/hooks build` first. ELVARIA_CODEX overrides where Codex is.
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { STDOUT_FILE, conformanceChecks, toolPolicyOf } from '@elvaria/runner-core';
import type {
  ConformanceTarget,
  FailedWorkspace,
  JsonSchema,
  RunResult,
  RunnerSignal,
  SpawnRequest,
} from '@elvaria/runner-core';

import { TERRITORY, TRIBE, minimalEnv, openWorld, request } from './__fixtures__/codex.ts';
import { locateCodex } from './locate.ts';
import { createCodexRunner } from './runner.ts';
import type { World } from './__fixtures__/codex.ts';

const LIVE = process.env.ELVARIA_LIVE === '1';
const MODEL = 'gpt-6-luna-low';
const HOOK_DIST = path.resolve(import.meta.dirname, '..', '..', 'hooks', 'dist', 'elvaria-hook.js');
const CONTRACTS = path.resolve(import.meta.dirname, '..', '..', '..', 'docs', 'schemas');
const MINUTES = 4 * 60_000;
const STAMP = new Date().toISOString().replaceAll(':', '-');

/** A failed check's workspace (its run folder holds what Codex printed), kept in the OS temp folder for the owner. */
async function keepFailed({ scenario, dir }: FailedWorkspace): Promise<void> {
  const kept = path.join(tmpdir(), `elvaria live codex ${STAMP}`, scenario);
  await cp(dir, kept, { recursive: true });
  process.emitWarning(`live ${scenario}: its workspace is kept in ${kept}`);
}

let codex = '';
beforeAll(async () => {
  if (!LIVE) return;
  codex = process.env.ELVARIA_CODEX ?? (await locateCodex(process.env, process.platform)) ?? '';
});

const liveRunner = () =>
  createCodexRunner({
    tribe: TRIBE,
    launch: { command: codex, args: [] },
    hook: { command: process.execPath, args: ['--conditions=elvaria-dist', HOOK_DIST] },
    env: minimalEnv(),
    timeout_ms: 60_000,
  });

async function run(req: SpawnRequest): Promise<{ result: RunResult; text: string }> {
  const session = await liveRunner().spawn(req);
  const signals: RunnerSignal[] = [];
  for await (const signal of session.signals) signals.push(signal);
  const text = signals.flatMap((signal) => (signal.kind === 'text' ? [signal.text] : [])).join('\n');
  return { result: await session.wait(), text };
}

/** A session with no handover gate (the gate is the assignee's), judging with the given class tools. */
function probeRequest(world: World, user: string, allow: string[], extra: Partial<SpawnRequest> = {}) {
  const permissions = toolPolicyOf({
    role: 'verifier',
    characterClass: { tools: { allow, deny: [] } },
    territory: TERRITORY,
    cli_search: false,
  });
  const system = 'You are a probe of the Elvaria test suite. Do exactly what you are asked, nothing more.';
  // The fixture's character runs on MODEL already.
  return request(world, {}, { role: 'verifier', prompt: { system, user }, permissions, ...extra });
}

/** The lines the hook wrote for the session (events/<day>.jsonl), as types. */
async function eventTypes(world: World): Promise<string[]> {
  const dir = path.join(world.root, 'events');
  const files = await readdir(dir).catch(() => []);
  const texts = await Promise.all(files.map((file) => readFile(path.join(dir, file), 'utf8')));
  return texts.flatMap((text) =>
    text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => (JSON.parse(line) as { type: string }).type),
  );
}

describe.runIf(LIVE)('live: conformance suite against the real Codex CLI', () => {
  const target: ConformanceTarget = {
    name: 'codex_cli (live)',
    createRunner: () => liveRunner(),
    live: true,
    model: MODEL,
    env: minimalEnv(),
    timeout_ms: MINUTES,
    onFailed: keepFailed,
  };
  for (const check of conformanceChecks(target)) {
    it(check.id, { timeout: MINUTES }, async () => {
      expect(await check.run(target)).toBe('passed');
    });
  }
});

describe.runIf(LIVE)('live: what only a real session shows', () => {
  let world: World;
  beforeEach(async () => {
    world = await openWorld();
  });
  afterEach(() => world.remove());

  it(
    'reads the territory law from AGENTS.override.md, and the hook writes its lines',
    { timeout: MINUTES },
    async () => {
      await writeFile(
        path.join(world.plot, 'CLAUDE.md'),
        'The password of this territory is HEARTHSTONE.\n',
        'utf8',
      );
      const req = probeRequest(
        world,
        'What is the password of this territory? Reply with that one word. Use no tool.',
        ['Read'],
      );
      const { result, text } = await run(req);
      expect(result.outcome).toBe('completed');
      expect(text).toMatch(/HEARTHSTONE/);
      expect(await eventTypes(world)).toContain('agent.session.start');
    },
  );

  it('answers in the shape of the schema', { timeout: MINUTES }, async () => {
    const schema = {
      type: 'object',
      properties: { result: { type: 'string', enum: ['pass', 'fail'] }, notes: { type: 'string' } },
      required: ['result', 'notes'],
      additionalProperties: false,
    };
    const req = probeRequest(world, 'Give the verdict pass with the note "probe". Use no tool.', ['Read'], {
      structured: schema,
    });
    const { result } = await run(req);
    expect(result.structured).toEqual({ result: 'pass', notes: 'probe' });
  });

  it(
    "takes the Chancellor's memo-triage contract once strict, and hands back the core's shape",
    { timeout: MINUTES },
    async () => {
      // Every keyword of the core's contracts is in it (pattern, uniqueItems, default, $defs, if/then, a free object):
      // only the real API says which it refuses, before any model call (fix/codex-output-schema). As forTheCli
      // gives it: without the 2020-12 `$schema`.
      const memo = 'm_20261114_abcdef';
      const text = await readFile(path.join(CONTRACTS, 'memo-triage.schema.json'), 'utf8');
      const { $schema: _, ...contract } = JSON.parse(text) as JsonSchema;
      const ask = `Triage the memo ${memo}: action shelve, ask empty, note "probe". Fill in no other field. Use no tool.`;
      const req = probeRequest(world, ask, ['Read'], { structured: contract });
      const { result } = await run(req);
      const printed = await readFile(path.join(world.run_dir, STDOUT_FILE), 'utf8').catch(() => '');
      expect(result.outcome, printed).toBe('completed');
      expect(result.structured).toMatchObject({
        version: 1,
        decisions: [{ memo, action: 'shelve', note: 'probe' }],
      });
      expect(JSON.stringify(result.structured)).not.toContain('null');
    },
  );
});
