// askTemple (PS-12f): one session of the Monk, in role `monk`, with no tool and the Temple's caps, for the evidence
// pack; its reply held against the contract and the pack. On a tribe without a JSON Schema flag a reply that breaks
// either is tried once more, and both sessions' tokens are counted.
import path from 'node:path';

import { ClassIdSchema } from '@elvaria/domain';
import { RETRY_DIR, loadPromptTemplates } from '@elvaria/runner-core';
import type { TempleContext } from '@elvaria/runner-core';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHANCELLOR_CLASS_ENTRY, NATIVE, PARSED } from './__fixtures__/kingdom.ts';
import { ANSWER_TOKENS, scriptedRunner } from './__fixtures__/runner.ts';
import { TEMPLE_REPLY_JSON_SCHEMA, askTemple } from './temple.ts';
import type { Answer } from './__fixtures__/runner.ts';
import type { ChancellorChoice } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const FAILED = 'q_20261106_7k3m2a-1';
const MONK_CLASS = {
  ...CHANCELLOR_CLASS_ENTRY,
  id: ClassIdSchema.parse('monk'),
  is_monk: true,
  tools: { allow: ['Read', 'Glob', 'Grep'], deny: ['Edit', 'Write', 'Bash'] },
};

const CONTEXT: TempleContext = {
  locale: 'en',
  decree: null,
  class_prompt: null,
  trigger: 'quests',
  evidence: {
    groups: [
      {
        group: 'tests_fail',
        members: [
          {
            verdict: FAILED,
            quest: 'q_20261106_7k3m2a',
            n: 1,
            class: 'knight',
            tribe: 'claude',
            model: 'claude-sonnet-5-5',
            territory: 'dc1-se-team',
            tags: [],
            lessons: [],
            notes: 'pnpm test fails: the new handler has no test.',
          },
        ],
      },
    ],
    lines: [],
    reviews: [],
    checks: { 'dc1-se-team': ['test'] },
    scripts: [],
    dropped: [],
    // Branded ids, written as the pack carries them.
  } as unknown as TempleContext['evidence'],
  vocabulary: { classes: ['knight'], tribes: ['claude'], territories: ['dc1-se-team'], tags: [] },
};

const LETTER = {
  version: 1,
  decisions: [
    {
      group: 'tests_fail',
      rung: 'check',
      why: 'The territory has a test check; it should run before review.',
      letter: { source_verdict: FAILED, body: 'Run the `test` check of dc1-se-team before review.' },
    },
  ],
};
/** Rung check with a line too: the contract's rule, which a CLI without the flag cannot hold. */
const LETTER_AND_LINE = {
  ...LETTER,
  decisions: [
    {
      ...LETTER.decisions[0],
      lesson: { owner: 'temple', text: 'Run the tests before you hand in.', source_verdict: FAILED },
    },
  ],
};

let dir: string;
let temp: TempDir;
beforeEach(async () => {
  temp = await tempDir('temple ạ');
  dir = temp.root;
});
afterEach(() => temp.remove());

function ask(answers: readonly Answer[], choice: ChancellorChoice = NATIVE) {
  const runner = scriptedRunner(answers);
  const session = {
    runner,
    choice,
    characterClass: MONK_CLASS,
    templates,
    run_dir: path.join(dir, 'temple-1'),
    env: { ELVARIA_KINGDOM: 'k' },
  };
  return { runner, asked: askTemple(CONTEXT, session) };
}

const fenced = (value: unknown) => `My decisions:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

describe('askTemple (PS-12f)', () => {
  it('asks one session as the Monk, with no tool, the temple-reply schema and the Temple’s caps', async () => {
    const { runner, asked } = ask([{ structured: LETTER }]);
    const result = await asked;
    expect(result.ok && result.value).toEqual({
      reply: {
        ...LETTER,
        decisions: [{ ...LETTER.decisions[0], letter: { ...LETTER.decisions[0]?.letter, refs: [] } }],
        reviews: [],
      },
      session_ids: ['chancellor-1'],
      tokens: ANSWER_TOKENS,
    });
    const [request] = runner.requests;
    expect(request).toMatchObject({
      role: 'monk',
      structured: TEMPLE_REPLY_JSON_SCHEMA,
      budget: { max_turns: 3, max_minutes: 10 },
    });
    expect(request?.permissions.tools).toEqual([]);
    expect(request?.prompt.user).toContain('pnpm test fails: the new handler has no test.');
  });

  it('refuses a reply the pack does not take, and says what the session spent', async () => {
    const stranger = { ...LETTER, decisions: [{ ...LETTER.decisions[0], group: 'flaky' }] };
    const result = await ask([{ structured: stranger }]).asked;
    expect(!result.ok && result.error).toEqual({
      failure: {
        code: 'invalid_reply',
        issues: [
          'decisions: flaky is not a group of the pack',
          'decisions: no decision for group tests_fail',
        ],
      },
      tokens: ANSWER_TOKENS,
      session_ids: ['chancellor-1'],
    });
  });

  it('tries a text reply that breaks the contract once more, and counts both sessions', async () => {
    const { runner, asked } = ask([{ text: fenced(LETTER_AND_LINE) }, { text: fenced(LETTER) }], PARSED);
    const result = await asked;
    expect(result.ok && result.value.tokens).toBe(2 * ANSWER_TOKENS);
    expect(result.ok && result.value.session_ids).toEqual(['chancellor-1', 'chancellor-2']);
    expect(runner.requests[1]?.run_dir).toBe(path.join(dir, 'temple-1', RETRY_DIR));
    expect(runner.requests[1]?.prompt.user).toContain('rung check takes a letter only');
    expect(runner.requests[0]?.prompt.system).toContain('# Reply format');
  });

  it('gives up after the retry, and on a session with nothing to read spends nothing it knows of', async () => {
    const twice = await ask([{ text: fenced(LETTER_AND_LINE) }, { text: fenced(LETTER_AND_LINE) }], PARSED)
      .asked;
    expect(!twice.ok && twice.error.failure.code).toBe('invalid_reply');
    expect(!twice.ok && twice.error.tokens).toBe(2 * ANSWER_TOKENS);
    const limited = await ask([{ rate_limited: true }]).asked;
    expect(!limited.ok && limited.error).toEqual({
      failure: { code: 'rate_limited' },
      tokens: 0,
      session_ids: [],
    });
  });
});
