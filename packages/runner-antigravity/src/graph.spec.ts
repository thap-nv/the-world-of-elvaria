// The code graph's commands on agy (PS-21): `command(<graph command>)` prefixes in the settings, for a class with a
// shell or not, as the search commands of P1-53; the hook refuses what a prefix lets through (`--graph`, a line that
// does more). Without a graph, the settings stay as they were.
import { describe, expect, it } from 'vitest';

import { toolPolicyOf } from '@elvaria/runner-core';

import { agySettingsOf } from './settings.ts';

/** runner-core grants them from the domain's GRAPH_COMMANDS; an adapter reaches the domain through runner-core only. */
const GRAPH_COMMANDS = ['graphify query', 'graphify path', 'graphify explain', 'graphify affected'];
const SCOUT = {
  tools: {
    allow: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
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
  commands: {},
  vcs: { type: 'git' as const, default_branch: 'main' },
};
const settingsOf = (graph: boolean) =>
  agySettingsOf(toolPolicyOf({ role: 'assignee', characterClass: SCOUT, territory: TERRITORY, graph }));

describe('graph commands on agy (PS-21)', () => {
  it('allows each graph command as a prefix', () => {
    const allow = settingsOf(true).permissions.allow;
    expect(allow.filter((rule) => rule.startsWith('command('))).toEqual(
      GRAPH_COMMANDS.map((command) => `command(${command})`),
    );
  });

  it('changes nothing without a graph', () => {
    expect(settingsOf(false).permissions.allow.some((rule) => rule.includes('graphify'))).toBe(false);
  });
});
