// The code graph's commands on Claude Code (PS-21): one `Bash(<command>:*)` allow rule each, and the shell tool for a
// class that has none, for these alone (the hook refuses the rest). Without a graph, the settings and `--tools` stay.
import { describe, expect, it } from 'vitest';

import { toolPolicyOf } from '@elvaria/runner-core';

import { graphRules, sessionTools } from './graph-rules.ts';
import { settingsOf } from './settings.ts';

/** runner-core grants them from the domain's GRAPH_COMMANDS; an adapter reaches the domain through runner-core only. */
const GRAPH_COMMANDS = ['graphify query', 'graphify path', 'graphify explain', 'graphify affected'];
const SCOUT = {
  tools: {
    allow: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    deny: ['Bash(git push:*)'],
  },
};
const KNIGHT = {
  tools: {
    allow: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(pnpm test:*)'],
    deny: ['Bash(git push:*)'],
  },
};
const TERRITORY = {
  laws: {
    forbidden_paths: [],
    read_only_paths: [],
    patch_paths: [],
    forbidden_commands: [],
    read_before_write: [],
    rank_floor: [],
  },
  checks: [],
  commands: { test: 'pnpm test' },
  vcs: { type: 'git' as const, default_branch: 'main' },
};
const HOOK = { command: 'node', args: ['hook.js'] };
const policyOf = (characterClass: typeof SCOUT, graph: boolean) =>
  toolPolicyOf({ role: 'assignee', characterClass, territory: TERRITORY, graph });

describe('graph rules on Claude Code (PS-21)', () => {
  it('gives a shell-less scout the shell, with the graph commands as its only rules', () => {
    const policy = policyOf(SCOUT, true);
    expect(sessionTools(policy)).toEqual([...policy.tools, 'Bash']);
    const allow = settingsOf(policy, HOOK, {}).permissions.allow;
    expect(allow.filter((rule) => rule.startsWith('Bash('))).toEqual(
      GRAPH_COMMANDS.map((command) => `Bash(${command}:*)`),
    );
  });

  it("adds the rules to a knight's own, its shell already there", () => {
    const policy = policyOf(KNIGHT, true);
    expect(sessionTools(policy)).toBe(policy.tools);
    expect(graphRules(policy)).toHaveLength(GRAPH_COMMANDS.length);
    expect(settingsOf(policy, HOOK, {}).permissions.allow).toContain('Bash(pnpm test:*)');
  });

  it('changes nothing without a graph', () => {
    const policy = policyOf(SCOUT, false);
    expect(sessionTools(policy)).toBe(policy.tools);
    expect(graphRules(policy)).toEqual([]);
    expect(settingsOf(policy, HOOK, {})).toEqual(settingsOf(policyOf(SCOUT, false), HOOK, {}));
  });
});
