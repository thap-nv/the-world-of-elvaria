// Search for a tribe whose CLI has none (P1-53): agy under `-p` has no tool to search files, so a class with Glob or
// Grep gets git's read-only `git grep` and `git ls-files` (ToolPolicy `search_commands`), on a git plot only; the
// policy file hands them to the hook, the prompt lists them with how to call them. A CLI that searches on its own
// (absent or true `capabilities.search`) changes nothing.
import { describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, SABLE, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { buildPrompt } from '../prompt/build-prompt.ts';
import { loadPromptTemplates } from '../prompt/templates.ts';
import { policyFileOf } from '../runner/policy-file.ts';
import { SEARCH_COMMANDS } from './constants.ts';
import { toolPolicyOf } from './tool-policy.ts';
import type { RunContext } from '../runner/run-context.ts';
import type { Character, CharacterClass, Territory } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const classOf = (id: string): CharacterClass => REGISTRY.classes.find((entry) => entry.id === id)!;
const NO_GIT: Territory = { ...TERRITORY, vcs: { type: 'none' } };
const CTX: RunContext = { character: 'sylva', role: 'assignee', model: 'gemini-3.8-flash-low' };

const searchOf = (
  id: string,
  extra: { cli_search?: boolean; territory?: Territory; role?: 'assignee' | 'verifier' } = {},
) =>
  toolPolicyOf({
    role: extra.role ?? 'assignee',
    characterClass: classOf(id),
    territory: extra.territory ?? TERRITORY,
    cli_search: 'cli_search' in extra ? extra.cli_search : false,
  }).search_commands;

describe('toolPolicyOf: search commands (P1-53)', () => {
  it('gives git grep and git ls-files to every class with Glob or Grep, a shell or not', () => {
    for (const id of ['scout', 'scribe', 'monk', 'bard', 'knight']) {
      expect(searchOf(id)).toEqual(['git grep', 'git ls-files']);
    }
    // A judge keeps them: searching changes nothing (ADR 0008).
    expect(searchOf('judge', { role: 'verifier' })).toEqual([...SEARCH_COMMANDS]);
  });

  it('gives them for Glob alone or Grep alone, never without either', () => {
    const only = (allow: string[], deny: string[] = []) =>
      toolPolicyOf({
        role: 'assignee',
        characterClass: { tools: { allow, deny } },
        territory: TERRITORY,
        cli_search: false,
      }).search_commands;
    expect(only(['Read', 'Glob'])).toEqual([...SEARCH_COMMANDS]);
    expect(only(['Read', 'Grep'])).toEqual([...SEARCH_COMMANDS]);
    expect(only(['Read', 'Write'])).toBeUndefined();
    expect(only(['Read', 'Glob', 'Grep'], ['Glob', 'Grep'])).toBeUndefined();
    expect(classOf('chancellor').tools.allow).toEqual([]);
    expect(searchOf('chancellor')).toBeUndefined();
  });

  it('gives none to a CLI that searches on its own, or that says nothing', () => {
    expect(searchOf('scout', { cli_search: true })).toBeUndefined();
    expect(
      toolPolicyOf({ role: 'assignee', characterClass: classOf('scout'), territory: TERRITORY }),
    ).not.toHaveProperty('search_commands');
  });

  it('gives none on a plot without git, nor to a session without a territory', () => {
    expect(searchOf('scout', { territory: NO_GIT })).toBeUndefined();
    const bare = toolPolicyOf({ role: 'assignee', characterClass: classOf('scout'), cli_search: false });
    expect(bare.search_commands).toBeUndefined();
  });

  it('adds no Bash rule and no shell tool: the commands are their own grant', () => {
    const policy = toolPolicyOf({
      role: 'assignee',
      characterClass: classOf('scout'),
      territory: TERRITORY,
      cli_search: false,
    });
    expect(policy.tools).not.toContain('Bash');
    expect(policy.allow.filter((rule) => rule.startsWith('Bash'))).toEqual([]);
  });
});

describe('policyFileOf: search commands for the hook (P1-53)', () => {
  it('writes them when the policy has them, and leaves the field out otherwise', () => {
    const scout = toolPolicyOf({
      role: 'assignee',
      characterClass: classOf('scout'),
      territory: TERRITORY,
      cli_search: false,
    });
    expect(policyFileOf(CTX, scout).search_commands).toEqual(['git grep', 'git ls-files']);
    const claude = toolPolicyOf({ role: 'assignee', characterClass: classOf('scout'), territory: TERRITORY });
    expect(policyFileOf(CTX, claude)).not.toHaveProperty('search_commands');
  });
});

describe('the prompt: how to search without a search tool (P1-53)', () => {
  const base = {
    locale: 'en',
    decree: null,
    territory: TERRITORY,
    registry: REGISTRY,
    scriptures: [],
    gazetteer: null,
    class_prompt: null,
    skills: [],
    handover_path: 'D:/Elvaria kingdom/quests/q/handover.md',
    continuation: null,
    role: 'assignee',
  } as const;
  const scout: Character = { ...THORN, class: 'scout' as Character['class'] };

  it('lists the search commands to a class without a shell, with how to call them', () => {
    const { system } = buildPrompt(
      {
        ...base,
        quest: QUEST,
        character: scout,
        cli_search: false,
        shell: 'Windows PowerShell (powershell.exe)',
      },
      templates,
    );
    expect(system).toContain('# Your shell');
    expect(system).toContain('Your shell is Windows PowerShell (powershell.exe)');
    expect(system).toContain('- `git grep`\n- `git ls-files`\n\nYour CLI has no tool to search files');
    expect(system).toContain("git grep -n -e '<pattern>' -- '<path>'");
    expect(system).toContain('`--no-index`, `--untracked`, `--textconv`) are refused.');
  });

  it("lists them after a judge's own commands", () => {
    const { system } = buildPrompt(
      {
        ...base,
        role: 'verifier',
        quest: QUEST,
        character: SABLE,
        cli_search: false,
        handover: null,
        diff: '',
        checks: [],
        partial: null,
      },
      templates,
    );
    expect(system).toMatch(
      /- `git diff`\n(?:- `[^`]+`\n)*- `git grep`\n- `git ls-files`\n\nYour CLI has no tool/,
    );
  });

  it('says nothing new to a class that searches with its own tools, as before', () => {
    const before = buildPrompt({ ...base, quest: QUEST, character: scout }, templates).system;
    expect(buildPrompt({ ...base, quest: QUEST, character: scout, cli_search: true }, templates).system).toBe(
      before,
    );
    expect(before).not.toContain('# Your shell');
    expect(before).not.toContain('git grep');
  });
});
