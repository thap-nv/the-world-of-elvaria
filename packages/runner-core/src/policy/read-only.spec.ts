// The tools of a read-only quest's sessions (P2-01d, W7): reading tools and the two write tools of the class, no
// shell, no web, no apprentice, no patch; writes fenced to the report, as policy.json tells the hook.
import { describe, expect, it } from 'vitest';

import { REGISTRY, TERRITORY } from '../__fixtures__/world.ts';
import { policyFileOf } from '../runner/policy-file.ts';
import { REPORT_FILE, readOnlyPolicyOf, writeRefusal } from './read-only.ts';
import { toolPolicyOf } from './tool-policy.ts';
import type { RunContext } from '../runner/run-context.ts';
import type { CharacterClass } from '@elvaria/domain';

const classOf = (id: string): CharacterClass => REGISTRY.classes.find((entry) => entry.id === id)!;
const PATCHED = { ...TERRITORY, laws: { ...TERRITORY.laws, patch_paths: ['.husky/**'] } };

describe('a read-only quest’s policy', () => {
  it('keeps of a scout reading and writing, without the web (W7)', () => {
    const scout = toolPolicyOf({ role: 'assignee', characterClass: classOf('scout'), territory: TERRITORY });
    expect(scout.tools).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch']));
    const policy = toolPolicyOf({
      role: 'assignee',
      characterClass: classOf('scout'),
      territory: TERRITORY,
      read_only: true,
    });
    expect(policy.tools).toEqual(['Read', 'Edit', 'Write', 'Glob', 'Grep']);
    expect(policy.allow.filter((rule) => rule.startsWith('Web'))).toEqual([]);
    expect(policy.writable_paths).toEqual([REPORT_FILE]);
    expect(policy.deny).toEqual(scout.deny);
  });

  it('takes from a knight its shell, its apprentice and its patch, and from a judge nothing it writes', () => {
    const knight = classOf('knight');
    const base = { characterClass: knight, territory: PATCHED, graph: true, cli_search: false } as const;
    const full = toolPolicyOf({ role: 'assignee', ...base });
    expect(full.graph_commands).toBeDefined();
    expect(full.laws.patch_paths).toEqual(['.husky/**']);
    const policy = toolPolicyOf({ role: 'assignee', ...base, read_only: true });
    expect(policy.tools).toEqual(['Read', 'Edit', 'Write', 'Glob', 'Grep']);
    expect(policy.allow.some((rule) => rule.startsWith('Bash') || rule.startsWith('Agent'))).toBe(false);
    expect(policy.apprentice).toBeNull();
    expect(policy.laws.patch_paths).toEqual([]);
    expect(policy.graph_commands).toBeUndefined();
    // Git's read-only search commands stay, for a CLI without a search tool.
    expect(policy.search_commands).toEqual(full.search_commands);
    const judge = toolPolicyOf({
      role: 'verifier',
      characterClass: classOf('judge'),
      territory: TERRITORY,
      read_only: true,
    });
    expect(judge.tools).toEqual(['Read', 'Glob', 'Grep']);
  });

  it('is the plain policy of any other quest', () => {
    const input = { role: 'assignee', characterClass: classOf('scout'), territory: TERRITORY } as const;
    expect(toolPolicyOf({ ...input, read_only: false })).toEqual(toolPolicyOf(input));
    expect(toolPolicyOf(input).writable_paths).toBeUndefined();
  });

  it('hands the fence to the hook through policy.json, and to FakeRunner', () => {
    const policy = readOnlyPolicyOf(toolPolicyOf({ role: 'assignee', characterClass: classOf('scout') }));
    const ctx: RunContext = {
      kingdom: 'K',
      quest: 'q_20261128_r34d0n',
      attempt: 1,
      character: 'thorn',
      role: 'assignee',
      model: 'claude-sonnet-5-5',
    };
    expect(policyFileOf(ctx, policy).writable_paths).toEqual([REPORT_FILE]);
    expect(
      policyFileOf(ctx, toolPolicyOf({ role: 'assignee', characterClass: classOf('scout') })),
    ).not.toHaveProperty('writable_paths');
    expect(writeRefusal(policy, REPORT_FILE)).toBeUndefined();
    expect(writeRefusal(policy, `./notes/..\\${REPORT_FILE}`)).toBeUndefined();
    expect(writeRefusal(policy, 'src/app.ts')).toContain('src/app.ts is not yours to write');
    expect(writeRefusal({}, 'src/app.ts')).toBeUndefined();
  });
});
