import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  DECREE,
  DIFF,
  LETTER,
  PARTIAL,
  QUEST,
  REGISTRY,
  SABLE,
  TERRITORY,
  THORN,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { composed } from './prompt-blocks.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput, VerifierPromptInput } from './build-prompt.ts';
import type { PromptPart, PromptWithBlocks } from './prompt-blocks.ts';

const templates = await loadPromptTemplates();

const assignee: AssigneePromptInput = {
  role: 'assignee',
  locale: 'en',
  decree: null,
  quest: QUEST,
  character: THORN,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: ['- Run `pnpm i18n:check` before submitting any locale change.', '  '],
  skills: [],
  gazetteer: '`apps/api`: NestJS.',
  class_prompt: classPromptOf('knight'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
};

const verifier: VerifierPromptInput = {
  role: 'verifier',
  locale: 'en',
  decree: null,
  quest: QUEST,
  character: SABLE,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: PARTIAL,
  checks: CHECKS,
};

const idsOf = (prompt: PromptWithBlocks, part: PromptPart): string[] =>
  prompt.blocks.filter((block) => block.part === part).map(({ id }) => id);

/** The blocks of a part, a blank line apart, are exactly as long as its text. */
const addsUp = (prompt: PromptWithBlocks, part: PromptPart): boolean => {
  const blocks = prompt.blocks.filter((block) => block.part === part);
  const chars = blocks.reduce((total, block) => total + block.chars, 0);
  return chars + '\n\n'.length * Math.max(0, blocks.length - 1) === prompt[part].length;
};

describe('the blocks of a prompt (PS-01b)', () => {
  it("names an assignee's blocks in order and leaves the empty ones out", () => {
    const prompt = buildPrompt(assignee, templates);
    expect(idsOf(prompt, 'system')).toEqual(['role', 'class']);
    expect(idsOf(prompt, 'user')).toEqual(['quest', 'gazetteer', 'scripture']);
    expect(addsUp(prompt, 'system') && addsUp(prompt, 'user')).toBe(true);
  });

  it("names a verifier's, the decree first and the partial verdict before the review", () => {
    const prompt = buildPrompt({ ...verifier, decree: `\n${DECREE}\n` }, templates);
    expect(idsOf(prompt, 'system')).toEqual(['decree', 'role', 'class']);
    expect(idsOf(prompt, 'user')).toEqual(['quest', 'partial', 'review']);
    expect(prompt.blocks[0]?.chars).toBe(prompt.system.indexOf('\n\n# '));
    expect(addsUp(prompt, 'system') && addsUp(prompt, 'user')).toBe(true);
  });

  it('counts a block as the prompt carries it, trimmed', () => {
    expect(
      composed(
        [['role', '  You are Thorn.  ']],
        [
          ['quest', '\n# Quest\n'],
          ['skills', ' \n'],
        ],
      ),
    ).toEqual({
      system: 'You are Thorn.',
      user: '# Quest',
      blocks: [
        { part: 'system', id: 'role', chars: 14 },
        { part: 'user', id: 'quest', chars: 7 },
      ],
    });
  });
});
