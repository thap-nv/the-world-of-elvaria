// A quest's scope in its prompts (PS-05, ADR 0028): a fact line for the assignee and the judge, and the judge's
// section on the files changed outside it; a quest without a scope reads as before (the snapshots).
import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  DIFF,
  LETTER,
  QUEST,
  REGISTRY,
  SABLE,
  TERRITORY,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { outOfScopeBlock, scopeFacts, sharedFacts } from './scope.ts';
import { loadPromptTemplates } from './templates.ts';
import type { VerifierPromptInput } from './build-prompt.ts';
import type { Quest } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const SCOPED: Quest = { ...QUEST, scope_paths: ['scripts/**', 'package.json'] };

const judge = (outside?: readonly string[], quest = SCOPED): VerifierPromptInput => ({
  role: 'verifier',
  locale: 'en',
  decree: null,
  quest,
  character: SABLE,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
  ...(outside === undefined ? {} : { out_of_scope: outside }),
});

describe('the scope in a prompt', () => {
  it("states the quest's scope among its facts, to the assignee and the judge alike", () => {
    expect(scopeFacts(SCOPED)).toEqual([
      '- Scope: `scripts/**`, `package.json` (the files this quest changes; the judge sees every file changed outside it)',
    ]);
    expect(scopeFacts(QUEST)).toEqual([]);
    const { user } = buildPrompt(judge(), templates);
    expect(user).toContain('- Scope: `scripts/**`, `package.json`');
  });

  it('lists for the judge the files changed outside the scope, between the letter and the diff', () => {
    const { user } = buildPrompt(judge(['README.md', 'docs/notes.md']), templates);
    const section = user.indexOf('# Files changed outside the scope');
    expect(section).toBeGreaterThan(user.indexOf('# Handover letter of'));
    expect(section).toBeLessThan(user.indexOf('# Diff'));
    expect(user).toContain("The quest's scope is `scripts/**`, `package.json`.");
    expect(user).toContain('- `README.md`\n- `docs/notes.md`');
    expect(user).toContain('fails nothing by itself');
  });

  it('tells a session that drafts sub-quests the shared paths no scope names', () => {
    const shared = [{ glob: 'docs/schemas/**', merge: 'regenerate' as const }];
    expect(sharedFacts({ shared_paths: shared })).toEqual([
      '- Shared paths of this territory, which every quest may edit and no scope names: `docs/schemas/**`',
    ]);
    expect(sharedFacts({})).toEqual([]);
    const plan = { ...QUEST, kind: 'plan' as Quest['kind'] };
    const { user } = buildPrompt(
      { ...judge(undefined, plan), territory: { ...TERRITORY, shared_paths: shared } },
      templates,
    );
    expect(user).toContain('scope_paths (optional)');
    expect(user).toContain('no scope names: `docs/schemas/**`');
  });

  it('says nothing of it when the work stayed inside, or the quest has no scope', () => {
    const plain = buildPrompt(judge(undefined, QUEST), templates).user;
    expect(buildPrompt(judge([]), templates).user).not.toContain('outside the scope');
    expect(buildPrompt(judge(['README.md'], QUEST), templates).user).toBe(plain);
    expect(outOfScopeBlock(QUEST, ['README.md'], templates)).toBe('');
  });
});
