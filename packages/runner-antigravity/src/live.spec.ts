// Smoke runs against the real agy (ELVARIA_LIVE=1): they burn a little of the owner's Gemini pool with the
// cheapest model, so they run only on demand (.claude/rules/runner.md). The hook runs as in production, built:
// `node --conditions=elvaria-dist elvaria-hook.mjs <Event>` through cmd /c; run
// `pnpm --filter @elvaria/hooks build` first. ELVARIA_AGY overrides where agy is.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { conformanceChecks, loadPromptTemplates, toolPolicyOf } from '@elvaria/runner-core';
import type { ConformanceTarget, RunResult, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

import { TRIBE, minimalEnv, openWorld, request } from './__fixtures__/agy.ts';
import { ANTIGRAVITY_CAPABILITIES, createAntigravityRunner } from './runner.ts';
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

const PROBE_SYSTEM =
  'You are a probe of the Elvaria test suite. Do exactly what you are asked, nothing more.';

/** A territory on git with no laws but the fences every session gets: what search needs (P1-53). */
const GIT_TERRITORY = {
  laws: {
    forbidden_paths: [],
    read_only_paths: [],
    patch_paths: [],
    forbidden_commands: [],
    read_before_write: [],
    rank_floor: [],
  },
  checks: [],
  commands: {},
  vcs: { type: 'git' as const, default_branch: 'main' },
};

/**
 * A session with no handover gate (the gate is the assignee's) and the given class tools. The role goes in the
 * request: runner-core's context env, laid over the request's env, takes the role from there (P1-53 found the env
 * variable alone overridden, and the gate asking a class without Write for its letter).
 */
function probeRequest(world: World, user: string, allow: string[], extra: Partial<SpawnRequest> = {}) {
  const permissions = toolPolicyOf({ role: 'assignee', characterClass: { tools: { allow, deny: [] } } });
  const prompt = { system: PROBE_SYSTEM, user };
  return request(world, {}, { role: 'verifier', prompt, permissions, ...extra });
}

/** The shell lines the hook saw run in the session (`agent.tool` with a command). */
async function commandsRun(world: World): Promise<string[]> {
  const dir = path.join(world.root, 'events');
  const texts = await Promise.all((await readdir(dir)).map((file) => readFile(path.join(dir, file), 'utf8')));
  return texts
    .flatMap((text) => text.split('\n'))
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { type: string; data: { command?: string } })
    .flatMap(({ type, data }) => (type === 'agent.tool' && data.command !== undefined ? [data.command] : []));
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
  for (const check of conformanceChecks(target)) {
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
      territory: {
        laws: { ...laws, read_only_paths: [], patch_paths: [], read_before_write: [], rank_floor: [] },
        checks: [],
        commands: {},
        vcs: { type: 'git', default_branch: 'main' },
      },
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
    // The first result changes with the engine: agy 1.5.5 gave "IANA-managed Reserved Domains" (P1-53).
    expect(text).toMatch(/example|iana/i);
  });

  // agy has no search tool under -p (P1-53): a scout's Grep becomes `git grep` in PowerShell on Windows, told by
  // prompts/search.md, as runner-core's prompt tells a real session.
  it('lets a scout without a shell find a string with git grep', { timeout: MINUTES }, async () => {
    const codeword = `ELVARIA-SEARCH-${Date.now().toString(36).toUpperCase()}`;
    await mkdir(path.join(world.plot, 'docs'), { recursive: true });
    const lines = Array.from({ length: 400 }, (_, index) => `Line ${index + 1} of the notes.`);
    lines.splice(250, 0, `The codeword is ${codeword}.`);
    await writeFile(path.join(world.plot, 'docs', 'notes.md'), `${lines.join('\n')}\n`, 'utf8');
    await writeFile(path.join(world.plot, 'README.md'), '# Probe\n', 'utf8');
    for (const args of [
      ['init', '-q'],
      ['add', '.'],
    ]) {
      execFileSync('git', args, { cwd: world.plot, env: minimalEnv(), stdio: 'ignore' });
    }
    const permissions = toolPolicyOf({
      role: 'assignee',
      characterClass: { tools: { allow: ['Read', 'Glob', 'Grep'], deny: [] } },
      territory: GIT_TERRITORY,
      cli_search: ANTIGRAVITY_CAPABILITIES.search,
    });
    const system = `${PROBE_SYSTEM}\n\n${(await loadPromptTemplates()).search}`;
    const user = `Which tracked file of your current folder holds the codeword ${codeword}, and on which line? Search for it with git grep once; do not read files. Reply with the path and the line number only.`;
    const req = request(world, {}, { role: 'verifier', prompt: { system, user }, permissions });
    const { result, text } = await run(req);
    expect(result.outcome).toBe('completed');
    expect(result.permission_denials).toEqual([]);
    expect((await commandsRun(world)).some((command) => command.startsWith('git grep'))).toBe(true);
    expect(text).toMatch(/docs[\\/]notes\.md/);
    expect(text).toContain('251');
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
