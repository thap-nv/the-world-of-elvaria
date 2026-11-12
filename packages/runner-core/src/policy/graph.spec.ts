// The code graph's commands (PS-21, owner 2026-11-11): a class with Glob or Grep that does not deny a bare `Bash` gets
// `graphify query`, `path`, `explain` and `affected` when its quest's graph is built, alike in every tribe; a class
// without a shell gets them alone, never its territory's checks; the policy file hands them to the hook, the system
// part gets a short block. With no graph, nothing changes, the prompt to the character above all.
import { GRAPH_COMMANDS } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { buildPrompt } from '../prompt/build-prompt.ts';
import { loadPromptTemplates } from '../prompt/templates.ts';
import { policyFileOf } from '../runner/policy-file.ts';
import { toolPolicyOf } from './tool-policy.ts';
import type { RunContext } from '../runner/run-context.ts';
import type { Character, CharacterClass } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const classOf = (id: string): CharacterClass => REGISTRY.classes.find((entry) => entry.id === id)!;
const CTX: RunContext = { character: 'sylva', role: 'assignee', model: 'gemini-3.8-flash-low' };

const policyOf = (id: string, graph = true, role: 'assignee' | 'verifier' = 'assignee') =>
  toolPolicyOf({ role, characterClass: classOf(id), territory: TERRITORY, graph });

describe('toolPolicyOf: graph commands (PS-21)', () => {
  it('gives them to every class that searches code and does not deny a bare shell', () => {
    for (const id of ['mage', 'knight', 'dwarf', 'astrologer', 'scout', 'scribe']) {
      expect(policyOf(id).graph_commands).toEqual([...GRAPH_COMMANDS]);
    }
    expect(policyOf('judge', true, 'verifier').graph_commands).toEqual([...GRAPH_COMMANDS]);
  });

  it('gives none to a class that denies a bare Bash, to one without Glob or Grep, or without a graph', () => {
    for (const id of ['bard', 'envoy', 'monk', 'chancellor'])
      expect(policyOf(id).graph_commands).toBeUndefined();
    expect(policyOf('knight', false).graph_commands).toBeUndefined();
    expect(
      toolPolicyOf({ role: 'assignee', characterClass: classOf('scout'), territory: TERRITORY }),
    ).not.toHaveProperty('graph_commands');
  });

  it("leaves a shell-less class's tools and rules as they were: no Bash, no check of the territory", () => {
    const without = policyOf('scout', false);
    const scout = policyOf('scout');
    expect(scout.tools).toEqual(without.tools);
    expect(scout.tools).not.toContain('Bash');
    expect(scout.allow).toEqual(without.allow);
    expect(scout.allow.some((rule) => rule.startsWith('Bash('))).toBe(false);
  });

  it('hands them to the hook through the policy file only when granted', () => {
    expect(policyFileOf(CTX, policyOf('scout')).graph_commands).toEqual([...GRAPH_COMMANDS]);
    expect(policyFileOf(CTX, policyOf('scout', false))).not.toHaveProperty('graph_commands');
  });
});

describe('the graph block of the system part (PS-21)', () => {
  const character = (id: string): Character => ({ ...THORN, class: id as Character['class'] });
  const base = (id: string) => ({
    locale: 'en' as const,
    decree: null,
    quest: QUEST,
    character: character(id),
    territory: TERRITORY,
    registry: REGISTRY,
    scriptures: [],
    gazetteer: null,
    class_prompt: null,
  });
  const assignee = (id: string, graph?: { commit: string }) =>
    buildPrompt(
      {
        ...base(id),
        role: 'assignee',
        skills: [],
        handover_path: 'C:/k/quests/q/handover.md',
        continuation: null,
        ...(graph === undefined ? {} : { graph }),
      },
      templates,
    );
  const COMMIT = '43566818d835f9acb3c24e8b2acffbfe90133284';

  it('names the commit and how to ask, in the system part, and only there', () => {
    const prompt = assignee('scout', { commit: COMMIT });
    expect(prompt.system).toContain('## Code graph');
    expect(prompt.system).toContain('`43566818d835`');
    expect(prompt.system).toContain("graphify affected '<name>'");
    expect(prompt.user).not.toContain('graphify');
    expect(prompt.blocks.find((block) => block.id === 'graph')?.part).toBe('system');
    expect(prompt.system).not.toContain('As a judge');
  });

  it('changes not one character of a prompt without a graph, or of a class the graph is not for', () => {
    expect(assignee('scout').system).not.toContain('graphify');
    expect(assignee('bard', { commit: COMMIT })).toEqual(assignee('bard'));
    expect(assignee('scout').blocks.some((block) => block.id === 'graph')).toBe(false);
  });

  it('tells a judge to ask what depends on what the diff changed', () => {
    const prompt = buildPrompt(
      {
        ...base('judge'),
        role: 'verifier',
        handover: null,
        diff: null,
        checks: [],
        partial: null,
        graph: { commit: COMMIT },
      },
      templates,
    );
    expect(prompt.system).toContain("As a judge, ask `graphify affected '<name>'`");
  });
});
