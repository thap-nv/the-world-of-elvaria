// The protected paths in the judge's prompt (the owner's settlement of PS-04 (c), ADR 0026): the files of
// quest.protected_changes, after the files changed outside the scope and before the diff; a quest that touched none
// reads as before (the snapshots of build-prompt.spec.ts).
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
import { protectedChangesBlock } from './protected.ts';
import { loadPromptTemplates } from './templates.ts';
import type { VerifierPromptInput } from './build-prompt.ts';
import type { Quest } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const TOUCHED = ['packages/hooks/src/run-hook.ts', 'CLAUDE.md'];

const judge = (quest: Quest, outside?: readonly string[]): VerifierPromptInput => ({
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

describe('the protected paths in the judge’s prompt', () => {
  it('lists the files after the letter and the files outside the scope, before the diff', async () => {
    const scoped: Quest = { ...QUEST, scope_paths: ['scripts/**'], protected_changes: TOUCHED };
    const { user } = buildPrompt(judge(scoped, ['README.md']), templates);
    const section = user.indexOf('# Protected paths changed');
    expect(section).toBeGreaterThan(user.indexOf('# Files changed outside the scope'));
    expect(section).toBeLessThan(user.indexOf('# Diff'));
    expect(user).toContain('- `packages/hooks/src/run-hook.ts`\n- `CLAUDE.md`');
    expect(user).toContain('line by line');
    await expect(protectedChangesBlock(scoped, templates)).toMatchFileSnapshot(
      '__snapshots__/verifier-protected.txt',
    );
  });

  it('says nothing of them when the work touched none', () => {
    const plain = buildPrompt(judge(QUEST), templates).user;
    expect(protectedChangesBlock(QUEST, templates)).toBe('');
    expect(plain).not.toContain('Protected paths');
    expect(buildPrompt(judge({ ...QUEST, protected_changes: TOUCHED }), templates).user).not.toBe(plain);
  });
});
