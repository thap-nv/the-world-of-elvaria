// askBard (P2-06b): one session of the Bard, in role `bard`, with no tool and its own caps, for the day's ledger; its
// reply is the prose as plain text, on a tribe with a JSON Schema flag or without one.
import path from 'node:path';

import { ClassIdSchema } from '@elvaria/domain';
import { loadPromptTemplates } from '@elvaria/runner-core';
import type { ChronicleContext } from '@elvaria/runner-core';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHANCELLOR_CLASS_ENTRY, NATIVE, PARSED } from './__fixtures__/kingdom.ts';
import { ANSWER_TOKENS, scriptedRunner } from './__fixtures__/runner.ts';
import { askBard, chronicleIssueText } from './bard.ts';
import type { Answer } from './__fixtures__/runner.ts';
import type { ChancellorChoice, ChronicleLedger } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const BARD_CLASS = {
  ...CHANCELLOR_CLASS_ENTRY,
  id: ClassIdSchema.parse('bard'),
  tools: { allow: ['Read', 'Write'], deny: ['Bash'] },
};

const CONTEXT: ChronicleContext = {
  locale: 'en',
  decree: null,
  kingdom: 'Elvaria',
  ledger: {
    version: 1,
    day: '2026-11-06',
    tz: 'Asia/Ho_Chi_Minh',
    entries: [{ at: '2026-11-06T10:00:00+07:00', kind: 'quest_done', quest: 'q_20261106_7k3m2a' }],
    counts: { quest_done: 1 },
    quests: 1,
    characters: [],
  } as unknown as ChronicleLedger,
  issues: [],
};

let temp: TempDir;
beforeEach(async () => {
  temp = await tempDir('bard ạ');
});
afterEach(() => temp.remove());

function ask(answers: readonly Answer[], choice: ChancellorChoice = NATIVE) {
  const runner = scriptedRunner(answers);
  const session = {
    runner,
    choice,
    characterClass: BARD_CLASS,
    templates,
    run_dir: path.join(temp.root, 'chronicle-1'),
    env: { ELVARIA_KINGDOM: 'k' },
  };
  return { runner, asked: askBard(CONTEXT, session) };
}

describe('askBard (P2-06b)', () => {
  it.each([
    ['with', NATIVE],
    ['without', PARSED],
  ])('asks one session %s a JSON Schema flag as the Bard, with no tool and no schema', async (_, choice) => {
    const { runner, asked } = ask([{ text: '  Brom finished the login page.  ' }], choice);
    expect(await asked).toEqual({
      ok: true,
      value: { reply: 'Brom finished the login page.', session_ids: ['chancellor-1'], tokens: ANSWER_TOKENS },
    });
    expect(runner.requests).toHaveLength(1);
    const [request] = runner.requests;
    expect(request?.role).toBe('bard');
    expect(request?.structured).toBeUndefined();
    expect(request?.permissions.tools).toEqual([]);
    expect(request?.budget).toEqual({ max_turns: 3, max_minutes: 5 });
    expect(request?.prompt.user).toContain('"quest":"q_20261106_7k3m2a"');
  });

  it('refuses an empty reply, with what the session spent', async () => {
    expect(await ask([{ text: '   ' }]).asked).toEqual({
      ok: false,
      error: {
        failure: { code: 'invalid_reply', issues: ['the reply is empty'] },
        tokens: ANSWER_TOKENS,
        session_ids: ['chancellor-1'],
      },
    });
  });

  it('says why when no reply came back, with nothing spent', async () => {
    expect(await ask([{ rate_limited: true }]).asked).toEqual({
      ok: false,
      error: { failure: { code: 'rate_limited' }, tokens: 0, session_ids: [] },
    });
  });
});

describe('chronicleIssueText (P2-06b)', () => {
  it.each([
    [{ code: 'unknown_quest', quest: 'q_x' }, 'names quest q_x, which the ledger does not hold'],
    [{ code: 'idle_character', name: 'Vela' }, "names Vela, who is not among the day's characters"],
    [{ code: 'too_long', length: 7000, max: 6000 }, 'is 7000 characters long, over the 6000 allowed'],
  ] as const)('words %o for the second try', (issue, text) => {
    expect(chronicleIssueText(issue)).toBe(text);
  });
});
