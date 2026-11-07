// Smoke runs against the real agy (ELVARIA_LIVE=1): they burn a little of the owner's Gemini pool with the
// cheapest model, so they run only on demand (.claude/rules/runner.md). The hook runs as in production, built:
// `node --conditions=elvaria-dist elvaria-hook.mjs <Event>` through cmd /c; run
// `pnpm --filter @elvaria/hooks build` first. ELVARIA_AGY overrides where agy is.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { conformanceChecks, toolPolicyOf } from '@elvaria/runner-core';
import type { ConformanceTarget, RunResult, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

import { TRIBE, minimalEnv, openWorld, request } from './__fixtures__/agy.ts';
import { createAntigravityRunner } from './runner.ts';
import type { World } from './__fixtures__/agy.ts';

const LIVE = process.env.ELVARIA_LIVE === '1';
const MODEL = 'gemini-3.8-flash-low';
const AGY =
  process.env.ELVARIA_AGY ??
  path.join(os.homedir(), '.gemini', 'bin', process.platform === 'win32' ? 'agy.exe' : 'agy');
const HOOK_DIST = path.resolve(import.meta.dirname, '..', '..', 'hooks', 'dist', 'elvaria-hook.js');
const MINUTES = 4 * 60_000;

const liveRunner = () =>
  createAntigravityRunner({
    tribe: TRIBE,
    launch: { command: AGY, args: [] },
    hook: { command: process.execPath, args: ['--conditions=elvaria-dist', HOOK_DIST] },
    terms_acknowledged_at: '2026-11-06T22:00:00+07:00',
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

/** A session with no handover gate (the gate is the assignee's) and the given class tools. */
function probeRequest(world: World, user: string, allow: string[], extra: Partial<SpawnRequest> = {}) {
  const permissions = toolPolicyOf({ role: 'assignee', characterClass: { tools: { allow, deny: [] } } });
  const system = 'You are a probe of the Elvaria test suite. Do exactly what you are asked, nothing more.';
  return request(world, { ELVARIA_ROLE: 'verifier' }, { prompt: { system, user }, permissions, ...extra });
}

describe.runIf(LIVE)('agy for real', () => {
  beforeAll(() => {
    if (!existsSync(HOOK_DIST))
      throw new Error(`${HOOK_DIST} is missing: pnpm --filter @elvaria/hooks build`);
    if (!existsSync(AGY)) throw new Error(`no agy at ${AGY}; set ELVARIA_AGY`);
  });

  const target: ConformanceTarget = {
    name: 'antigravity (agy)',
    createRunner: liveRunner,
    live: true,
    model: MODEL,
    env: minimalEnv(),
    timeout_ms: MINUTES,
  };
  // forbidden_command runs below with a budget that fits: on an assignee probe the handover gate adds 3-4 turns
  // to the probe's max_turns 5 (refused push, answer, letter asked twice), so the breaker stops it first
  // (implementation-plan §11, P1-12b). The fake CLI runs it in conformance.spec.ts.
  for (const check of conformanceChecks(target).filter(({ id }) => id !== 'forbidden_command')) {
    it(`conformance: ${check.id}`, { timeout: MINUTES }, async () => {
      expect(await check.run(target)).toBe('passed');
    });
  }

  let world: World;
  beforeEach(async () => {
    world = await openWorld();
  });
  afterEach(() => world.remove());

  it('hands the model CLAUDE.md and the rules through GEMINI.md', { timeout: MINUTES }, async () => {
    await mkdir(path.join(world.plot, '.claude', 'rules'), { recursive: true });
    const law = '# dc1\n\n## Convention bắt buộc / Required conventions\n\n- Code in English.\n';
    await writeFile(path.join(world.plot, 'CLAUDE.md'), law, 'utf8');
    const rule = '# Rules · apps/api\n\n## Required conventions\n\n- Validate input.\n';
    await writeFile(path.join(world.plot, '.claude', 'rules', 'api.md'), rule, 'utf8');
    const ask = [
      'List the required conventions you were given in the territory law and in each rules file.',
      'Give the headings only, verbatim, one per line, each file’s top heading first. Use no tool.',
    ].join(' ');
    // Reading the files is forbidden, so what the model knows of them came through GEMINI.md (spike §1 #15).
    const laws = { forbidden_paths: ['CLAUDE.md', '.claude/**'], forbidden_commands: [] };
    const permissions = toolPolicyOf({
      role: 'assignee',
      characterClass: { tools: { allow: ['Read'], deny: [] } },
      territory: { laws: { ...laws, read_before_write: [], rank_floor: [] }, checks: [], commands: {} },
    });
    const { result, text } = await run(probeRequest(world, ask, ['Read'], { permissions }));
    expect(result.outcome).toBe('completed');
    expect(text).toContain('Convention bắt buộc / Required conventions');
    expect(text).toContain('Rules · apps/api');
  });

  it(
    'hard-denies what the class lacks, and the session goes on to the end',
    { timeout: MINUTES },
    async () => {
      const steps = [
        'Do these steps in order, each exactly once; when a step is refused, note the error and go on, without retrying.',
        '1) Run the shell command: git push origin HEAD',
        '2) Run the shell command: git log --oneline -1',
        '3) Run the shell command: node --version',
        '4) Write the file notes/live.txt containing the word ok.',
        `5) Write the file ${world.handover} containing the line: ## Where I am`,
        'Then reply with one line per step: what it printed, or the error.',
      ].join('\n');
      const { result } = await run(probeRequest(world, steps, ['Read', 'Write', 'Bash(node --version:*)']));
      expect(result).toMatchObject({ outcome: 'completed', exit_code: 0, rate_limited: false });
      const refused = result.permission_denials.map(({ detail }) => detail);
      expect(refused).toEqual(expect.arrayContaining(['git push origin HEAD', 'git log --oneline -1']));
      expect(refused).not.toContain('node --version');
      expect(existsSync(path.join(world.plot, 'notes', 'live.txt'))).toBe(true);
      expect(existsSync(world.handover)).toBe(true);
    },
  );

  // Under -p agy 1.5.2 gives the model search_web and no URL fetch (P1-12b): a scout's web is the search,
  // which needs no permission rule.
  it('lets a scout search the web', { timeout: MINUTES }, async () => {
    const ask =
      'Use your search_web tool once to search for: IANA example domain. Reply with the first result title.';
    const { result, text } = await run(probeRequest(world, ask, ['Read', 'WebSearch']));
    expect(result).toMatchObject({ outcome: 'completed', permission_denials: [] });
    expect(text).toMatch(/example/i);
  });

  it('resumes a conversation with --conversation', { timeout: MINUTES }, async () => {
    const first = await run(
      probeRequest(world, 'Remember the codeword PLUM-42. Reply with: ok. Use no tool.', []),
    );
    const ask = 'What codeword did I give you earlier? Reply with it only. Use no tool.';
    const resume = { session_id: first.result.session_id };
    const second = await run(probeRequest(world, ask, [], { resume }));
    expect(second.result.session_id).toBe(first.result.session_id);
    expect(second.text).toContain('PLUM-42');
  });
});
