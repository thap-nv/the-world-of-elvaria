import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { parsePolicy, readPolicy } from './policy.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { PolicyResult } from './policy.ts';

describe('parsePolicy', () => {
  it('takes a policy with context and laws', () => {
    const policy = {
      version: 1,
      kingdom: 'D:/kingdom',
      quest: 'q_20261106_7k3m2a',
      attempt: 2,
      character: 'thorn',
      role: 'assignee',
      model: 'claude-opus-5-5',
      tz: 'Asia/Ho_Chi_Minh',
      secrets: ['NPM_TOKEN'],
      tools: ['Read', 'Glob', 'Grep'],
      apprentice_models: ['haiku', 'sonnet', 'opus'],
      cli_protected_paths: ['.husky/**', '.npmrc'],
      patch_file: 'elvaria.patch',
      search_commands: ['git grep', 'git ls-files'],
      laws: {
        ...DC1_LAWS,
        read_only_paths: ['docs/glossary.md'],
        patch_paths: ['.husky/**'],
        read_before_write: ['packages/shared/**'],
      },
    };
    expect(parsePolicy(policy)).toEqual({ ok: true, policy });
  });

  it('takes a policy with nothing but its version', () => {
    expect(parsePolicy({ version: 1 }).ok).toBe(true);
  });

  it.each([
    [[], 'not a JSON object'],
    [{ version: 2 }, 'version is 2, not 1'],
    [{}, 'version is undefined, not 1'],
    [{ version: 1, quest: 7 }, 'quest is not a string'],
    [{ version: 1, model: ['x'] }, 'model is not a string'],
    [{ version: 1, attempt: 0 }, 'attempt is not an integer >= 1'],
    [{ version: 1, attempt: 1.5 }, 'attempt is not an integer >= 1'],
    [{ version: 1, secrets: 'NPM_TOKEN' }, 'secrets is not a list of strings'],
    [{ version: 1, tools: ['Read', 7] }, 'tools is not a list of strings'],
    [{ version: 1, apprentice_models: 'haiku' }, 'apprentice_models is not a list of strings'],
    [{ version: 1, cli_protected_paths: [null] }, 'cli_protected_paths is not a list of strings'],
    [{ version: 1, search_commands: 'git grep' }, 'search_commands is not a list of strings'],
    [{ version: 1, laws: [] }, 'laws is not an object'],
    [{ version: 1, laws: { forbidden_paths: '.env' } }, 'laws.forbidden_paths is not a list of strings'],
    [{ version: 1, laws: { forbidden_commands: [1] } }, 'laws.forbidden_commands is not a list of strings'],
    [{ version: 1, laws: { read_only_paths: 'docs' } }, 'laws.read_only_paths is not a list of strings'],
    [{ version: 1, laws: { patch_paths: '.husky' } }, 'laws.patch_paths is not a list of strings'],
    [{ version: 1, patch_file: true }, 'patch_file is not a string'],
  ])('refuses %j', (value, problem) => {
    expect(parsePolicy(value)).toEqual({ ok: false, problem });
  });
});

describe('readPolicy', () => {
  let kingdom: TempKingdom;
  beforeEach(async () => {
    kingdom = await tempKingdom();
  });
  afterEach(() => kingdom.remove());

  it('reads a policy file', async () => {
    const file = path.join(kingdom.runDir, 'policy.json');
    await writeFile(file, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
    expect(readPolicy(file)).toEqual({ ok: true, policy: { version: 1, laws: DC1_LAWS } });
  });

  it('names the file in every problem', async () => {
    const file = path.join(kingdom.runDir, 'policy.json');
    const problemOf = (result: PolicyResult): string | undefined => (result.ok ? undefined : result.problem);
    expect(problemOf(readPolicy(file))).toContain(file);
    await writeFile(file, '{"version": 1,', 'utf8');
    expect(problemOf(readPolicy(file))).toContain(file);
    await writeFile(file, '{"version": 3}', 'utf8');
    expect(readPolicy(file)).toEqual({ ok: false, problem: `policy ${file}: version is 3, not 1` });
  });
});
