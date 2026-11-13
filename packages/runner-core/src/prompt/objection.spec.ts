// The prompts of an objection (PS-22, ADR 0024, ADR 0008, ADR 0025): the second judge reads the contested verdict and
// the objection before its review, never who wrote the verdict; an assignee whose objection a second judge overruled
// reads the first verdict beside the final one.
import { describe, expect, it } from 'vitest';

import { CONTESTED, FINAL, OBJECTION } from '../__fixtures__/objection.ts';
import {
  CHECKS,
  DIFF,
  FILED_MEMO,
  JOURNAL,
  LETTER,
  QUEST,
  REGISTRY,
  RETURNED,
  SABLE,
  TERRITORY,
  THORN,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput, VerifierPromptInput } from './build-prompt.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Verdict } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const show = ({ system, user }: BuiltPrompt) => `=== system ===
${system}

=== user ===
${user}
`;

const base = {
  locale: 'vi',
  decree: null,
  quest: QUEST,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
} as const;

const verifier: VerifierPromptInput = {
  ...base,
  role: 'verifier',
  character: SABLE,
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
};

/** What the continuing assignee of build-prompt.spec.ts reads beside its verdict. */
const MEMORY = {
  checks: CHECKS,
  touched: ['README.md', 'package.json', 'scripts/check.ts'],
  handover: LETTER,
  journal: JOURNAL,
  git_log: '1a2b3c4 feat: add pnpm check',
  memos: [FILED_MEMO],
};

const continuing = (verdict: Verdict, contested?: Verdict): AssigneePromptInput => ({
  ...base,
  role: 'assignee',
  character: THORN,
  class_prompt: classPromptOf('knight'),
  skills: [],
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: { reason: 'returned', verdict, ...(contested === undefined ? {} : { contested }), ...MEMORY },
});

describe('the prompts of an objection', () => {
  it('verifier-objection reads the contested verdict and the objection, never who wrote the verdict (PS-22)', async () => {
    const built = buildPrompt({ ...verifier, objection: OBJECTION }, templates);
    await expect(show(built)).toMatchFileSnapshot('__snapshots__/verifier-objection.txt');
    // No bond between characters reaches a judgement (ADR 0025): the first judge is not named anywhere.
    expect(`${built.system}
${built.user}`).not.toContain(CONTESTED.verifier_id);
    const blocks = built.blocks.map(({ id }) => id);
    expect(blocks.indexOf('objection')).toBe(blocks.indexOf('review') - 1);
    expect(buildPrompt({ ...verifier, objection: null }, templates)).toEqual(
      buildPrompt(verifier, templates),
    );
  });

  it('assignee-final reads the first verdict beside the final one, which an objection no longer reaches (PS-22)', async () => {
    const { user } = buildPrompt(continuing(FINAL, CONTESTED), templates);
    await expect(user).toMatchFileSnapshot('__snapshots__/assignee-final.txt');
    expect(user.indexOf('## The first verdict')).toBeLessThan(user.indexOf('## Verdict'));
    expect(user).toContain(CONTESTED.notes);
    expect(user).toContain(FINAL.notes);
    expect(user).not.toContain(CONTESTED.verifier_id);
    expect(buildPrompt(continuing(RETURNED), templates).user).not.toContain('## The first verdict');
  });
});
