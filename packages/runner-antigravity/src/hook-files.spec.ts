// The hook's way into agy (spike P1-12a §4): hooks.json in the form that ran on Windows, the shim, and the
// `/hooks` answer agy 1.5.2 gave for it (fixtures/hooks-json.jsonl).
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIXTURES, openWorld } from './__fixtures__/agy.ts';
import {
  HOOK_EVENTS,
  hookPlanOf,
  hooksJson,
  hooksProblem,
  isElvariaHooks,
  sameFile,
  shimSource,
} from './hook-files.ts';
import type { World } from './__fixtures__/agy.ts';

const NODE = path.join(path.sep, 'opt', 'node', 'bin', 'node');
const SCRIPT = path.join(path.sep, 'repo', 'packages', 'hooks', 'dist', 'elvaria-hook.js');
const PLAN = hookPlanOf({ command: NODE, args: ['--conditions=elvaria-dist', SCRIPT] });

describe('hookPlanOf', () => {
  it('reads hookCommand(): Node flags, the script, and the folder of that Node', () => {
    expect(PLAN).toEqual({
      script: SCRIPT,
      node_flags: ['--conditions=elvaria-dist'],
      node_dir: path.dirname(NODE),
    });
    expect(hookPlanOf({ command: 'node', args: [SCRIPT, '--policy', 'p.json'] })).toEqual({
      script: SCRIPT,
      node_flags: [],
      node_dir: undefined,
    });
  });

  it('refuses a command without a script, or with a flag the shell would split', () => {
    expect(() => hookPlanOf({ command: NODE, args: ['--conditions=x'] })).toThrow(/names no script/);
    expect(() => hookPlanOf({ command: NODE, args: ['--title=a b', SCRIPT] })).toThrow(/unquoted/);
  });
});

describe('hooks.json and its shim', () => {
  it('declare the four events with no quote and no absolute path, as spike M1b ran them', () => {
    const declared = JSON.parse(hooksJson(PLAN)) as { elvaria: Record<string, unknown> };
    expect(Object.keys(declared)).toEqual(['elvaria']);
    expect(Object.keys(declared.elvaria)).toEqual([...HOOK_EVENTS]);
    expect(declared.elvaria.PreToolUse).toEqual([
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: 'node --conditions=elvaria-dist elvaria-hook.mjs PreToolUse',
            timeout: 10,
          },
        ],
      },
    ]);
    expect(declared.elvaria.Stop).toEqual([
      { type: 'command', command: 'node --conditions=elvaria-dist elvaria-hook.mjs Stop', timeout: 10 },
    ]);
    const commands = [...hooksJson(PLAN).matchAll(/"command": "([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(commands).toHaveLength(HOOK_EVENTS.length);
    expect(commands.filter((command) => /["'\\/]/.test(command))).toEqual([]);
  });

  it('let the shim hold the paths: the policy in argv, the hook by URL', () => {
    const policy = 'C:\\Elvaria kingdom\\.runs\\q-1\\policy.json';
    const shim = shimSource(PLAN, policy);
    expect(shim).toContain(`process.argv.push('--policy', ${JSON.stringify(policy)});`);
    expect(shim).toContain(`await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`);
  });

  it("tell Elvaria's hooks.json from a territory's", () => {
    expect(isElvariaHooks(hooksJson(PLAN))).toBe(true);
    expect(isElvariaHooks('{"lint": {}}')).toBe(false);
    expect(isElvariaHooks('{"elvaria": {}, "lint": {}}')).toBe(false);
    expect(isElvariaHooks('not json')).toBe(false);
  });
});

describe('hooksProblem: what agy -p /hooks says', () => {
  let world: World;
  let ours: string;
  /** The recorded answer, its source pointed at this world's hooks.json. */
  let answer: { command: { data: { hooks: Record<string, unknown>[] } } };
  beforeEach(async () => {
    world = await openWorld();
    ours = path.join(world.plot, '.agents', 'hooks.json');
    await mkdir(path.dirname(ours), { recursive: true });
    await writeFile(ours, hooksJson(PLAN), 'utf8');
    answer = JSON.parse(readFileSync(path.join(FIXTURES, 'hooks-json.jsonl'), 'utf8')) as typeof answer;
    for (const hook of answer.command.data.hooks) hook.source = ours;
  });
  afterEach(() => world.remove());

  const problem = () => hooksProblem(JSON.stringify(answer), ours);

  it('is none for the recorded answer', () => {
    expect(problem()).toBeUndefined();
  });

  it('names a hooks.json agy did not load, or loaded disabled or short of an event', () => {
    answer.command.data.hooks[0] = {
      ...answer.command.data.hooks[0],
      source: path.join(world.root, 'other.json'),
    };
    expect(problem()).toMatch(/^agy did not load /);
    answer.command.data.hooks[0] = { ...answer.command.data.hooks[0], source: ours, enabled: false };
    expect(problem()).toMatch(/disabled/);
    answer.command.data.hooks[0] = {
      ...answer.command.data.hooks[0],
      enabled: true,
      actions: [{ event: 'Stop' }],
    };
    expect(problem()).toMatch(/SessionStart, PreToolUse, PostToolUse/);
  });

  it("refuses hooks Elvaria does not control, such as the owner's global ones", () => {
    answer.command.data.hooks.push({ name: 'mine', enabled: true, source: '~/.gemini/config/hooks.json' });
    expect(problem()).toMatch(/does not control: mine \(~\/\.gemini\/config\/hooks\.json\)/);
  });

  it('says when the answer is not the recorded shape', () => {
    expect(hooksProblem('oops', ours)).toMatch(/did not answer JSON/);
    expect(hooksProblem('{"command": {}}', ours)).toMatch(/no hook list/);
  });

  it('knows a file by identity, not by spelling', () => {
    expect(sameFile(path.join(world.plot, '.agents', '.', 'hooks.json'), ours)).toBe(true);
    expect(sameFile(path.join(world.plot, '.agents', '..', '.agents', 'hooks.json'), ours)).toBe(true);
    expect(sameFile(path.join(world.plot, 'missing.json'), ours)).toBe(false);
  });
});
