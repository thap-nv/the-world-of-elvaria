// A scout of the Gemini tribe searches (P1-53): agy has no search tool under `-p`, so the adapter declares
// `search: false`, runner-core gives the scout's Glob and Grep `git grep` and `git ls-files`, the settings allow them
// as prefixes and policy.json names them for the hook. End to end against fake-agy.mjs, which applies the settings as
// agy does, through the real hook and its shim: a plain search runs; the options that run a program or reach past
// the tracked files, a line that does more, and any other command are refused, and the session goes on.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toolPolicyOf } from '@elvaria/runner-core';
import type { RunResult, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

import { fakeRunner, openWorld, request } from './__fixtures__/agy.ts';
import { ANTIGRAVITY_CAPABILITIES } from './runner.ts';
import type { World } from './__fixtures__/agy.ts';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

const SCOUT = {
  tools: {
    allow: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    deny: ['Bash(git push:*)'],
  },
};
const TERRITORY = {
  laws: {
    forbidden_paths: ['infra/secrets/**'],
    read_only_paths: [],
    patch_paths: [],
    forbidden_commands: [],
    read_before_write: [],
    rank_floor: [],
  },
  checks: [],
  commands: {},
  vcs: { type: 'git' as const, default_branch: 'main' },
} as unknown as NonNullable<SpawnRequest['territory']>;

const PLAIN = ["git grep -n -e 'release' -- 'docs'", "git ls-files 'docs/*.md'"];
const REFUSED = [
  'git grep -nOecho release',
  'git grep --no-ind SECRET',
  'git grep -n release; Remove-Item -Recurse docs',
  "Select-String -Path docs -Pattern 'release'",
];

async function scoutRuns(commands: readonly string[]): Promise<RunResult> {
  const permissions = toolPolicyOf({
    role: 'assignee',
    characterClass: SCOUT,
    territory: TERRITORY,
    cli_search: ANTIGRAVITY_CAPABILITIES.search,
  });
  const env = { ELVARIA_FAKE_SCENARIO: 'commands', ELVARIA_FAKE_COMMANDS: JSON.stringify(commands) };
  const session = await fakeRunner().spawn(request(world, env, { permissions }));
  const signals: RunnerSignal[] = [];
  for await (const signal of session.signals) signals.push(signal);
  return session.wait();
}

describe('a scout of the Gemini tribe searches with git (P1-53)', () => {
  it('runs a plain search and refuses the rest, the session going on to the end', async () => {
    const result = await scoutRuns([...PLAIN, ...REFUSED]);
    expect(result).toMatchObject({ outcome: 'completed', exit_code: 0 });
    expect(result.permission_denials.map(({ detail }) => detail)).toEqual(REFUSED);
  });

  it('writes the search into the run files: settings for agy, policy.json for the hook', async () => {
    await scoutRuns([]);
    const settings = JSON.parse(await readFile(path.join(world.run_dir, 'settings.json'), 'utf8')) as {
      permissions: { allow: string[] };
    };
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining(['command(git grep)', 'command(git ls-files)']),
    );
    const policy = JSON.parse(await readFile(path.join(world.run_dir, 'policy.json'), 'utf8')) as {
      search_commands?: string[];
    };
    expect(policy.search_commands).toEqual(['git grep', 'git ls-files']);
  });
});
