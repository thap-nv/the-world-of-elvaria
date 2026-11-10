import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RETRY_DIR, loadPromptTemplates } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHANCELLOR_CLASS_ENTRY, CONTEXT, NATIVE, PARSED, reply } from './__fixtures__/kingdom.ts';
import { ANSWER_TOKENS, scriptedRunner } from './__fixtures__/runner.ts';
import { CHANCELLOR_MAX_TURNS } from './constants.ts';
import { draftQuests } from './draft-quests.ts';
import { QUEST_DRAFT_JSON_SCHEMA } from './reply.ts';
import type { Answer } from './__fixtures__/runner.ts';
import type { ChancellorChoice } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const ENV = { ELVARIA_KINGDOM: 'k', ELVARIA_ROLE: 'chancellor' };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'elvaria chancellor ạ '));
});
afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

function speak(answers: readonly Answer[], choice: ChancellorChoice = NATIVE, timeout_ms?: number) {
  const runner = scriptedRunner(answers);
  const session = {
    runner,
    choice,
    characterClass: CHANCELLOR_CLASS_ENTRY,
    templates,
    run_dir: path.join(dir, 'chancellor-1'),
    env: ENV,
    ...(timeout_ms === undefined ? {} : { timeout_ms }),
  };
  return { runner, drafted: draftQuests(CONTEXT, session) };
}

const fenced = (value: unknown) => `Here are the drafts:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

describe('draftQuests with structured output (§3.11)', () => {
  it('asks one session with no tool and the quest-draft schema, and reads its drafts', async () => {
    const { runner, drafted } = speak([{ structured: reply('link-check') }]);
    const result = await drafted;
    expect(result.ok && result.value).toMatchObject({
      kept: [{ ref: 'd1', tier: 'script', script: { id: 'link-check' } }],
      dropped: [],
      session_ids: ['chancellor-1'],
      tokens: ANSWER_TOKENS,
    });
    expect(result.ok && 'question' in result.value).toBe(false);
    const [request] = runner.requests;
    expect(request).toMatchObject({
      role: 'chancellor',
      character: NATIVE.character,
      cwd: path.join(dir, 'chancellor-1'),
      run_dir: path.join(dir, 'chancellor-1'),
      structured: QUEST_DRAFT_JSON_SCHEMA,
      budget: { max_turns: CHANCELLOR_MAX_TURNS },
      env: ENV,
    });
    expect(request?.permissions.tools).toEqual([]);
    expect(request?.quest).toBeUndefined();
    expect(request?.prompt.user).toContain('Kiểm tra link trong docs');
    expect(request?.prompt.system).not.toContain('# Reply format');
    expect((await stat(path.join(dir, 'chancellor-1'))).isDirectory()).toBe(true);
  });

  it('brings back the one question of a vague request, even when its draft is dropped', async () => {
    const vague = await speak([{ structured: reply('vague') }]).drafted;
    expect(vague.ok && vague.value.question).toBe('Tốt hơn ở mặt nào: tốc độ tải, giao diện, hay nội dung?');
    expect(vague.ok && vague.value.kept).toHaveLength(1);
    const file = reply('vague') as { drafts: Record<string, unknown>[] };
    const offTags = { ...file, drafts: file.drafts.map((draft) => ({ ...draft, tags: ['ui'] })) };
    const dropped = await speak([{ structured: offTags }]).drafted;
    expect(dropped.ok && [dropped.value.kept, dropped.value.question]).toEqual([
      [],
      'Tốt hơn ở mặt nào: tốc độ tải, giao diện, hay nội dung?',
    ]);
  });

  it('refuses a reply that breaks the contract, without asking again', async () => {
    const { runner, drafted } = speak([
      { structured: reply('two-questions') },
      { structured: reply('vague') },
    ]);
    expect(await drafted).toEqual({
      ok: false,
      error: {
        code: 'invalid_reply',
        issues: ['drafts.1.question: the Chancellor asks at most one question'],
      },
    });
    expect(runner.requests).toHaveLength(1);
  });

  it('says why there is no reply: the usage limit, a session that ended without one, the time', async () => {
    expect(await speak([{ rate_limited: true, outcome: 'error' }]).drafted).toEqual({
      ok: false,
      error: { code: 'rate_limited' },
    });
    expect(await speak([{ outcome: 'max_turns' }]).drafted).toEqual({
      ok: false,
      error: { code: 'no_reply', outcome: 'max_turns' },
    });
    expect(await speak([{ hang: true }], NATIVE, 20).drafted).toEqual({
      ok: false,
      error: { code: 'timed_out' },
    });
  });
});

describe('draftQuests on a tribe without structured output (§3.14)', () => {
  it('puts the schema in the prompt and reads the JSON of the last text', async () => {
    const { runner, drafted } = speak([{ text: fenced(reply('party')) }], PARSED);
    const result = await drafted;
    expect(result.ok && result.value.kept.map(({ party_role }) => party_role)).toEqual(['contract']);
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]).not.toHaveProperty('structured');
    expect(runner.requests[0]?.prompt.system).toContain('# Reply format');
    expect(runner.requests[0]?.character).toBe(PARSED.character);
  });

  it('asks once more, in a folder of its own, when the text cannot be used', async () => {
    const { runner, drafted } = speak(
      [{ text: 'I would rather not.' }, { text: fenced(reply('split')) }],
      PARSED,
    );
    const result = await drafted;
    expect(result.ok && result.value.kept).toHaveLength(3);
    expect(result.ok && result.value.session_ids).toEqual(['chancellor-1', 'chancellor-2']);
    expect(result.ok && result.value.tokens).toBe(2 * ANSWER_TOKENS);
    const second = runner.requests[1];
    expect(second?.run_dir).toBe(path.join(dir, 'chancellor-1', RETRY_DIR));
    expect(second?.prompt.user).toContain('# Your previous reply');
    expect(second?.prompt.user).toContain('(reply): ');
  });

  it('gives up after the second try', async () => {
    const twice = await speak([{ text: '{}' }, { text: fenced(reply('two-questions')) }], PARSED).drafted;
    expect(twice).toEqual({
      ok: false,
      error: {
        code: 'invalid_reply',
        issues: ['drafts.1.question: the Chancellor asks at most one question'],
      },
    });
    const limited = await speak([{ text: '{}' }, { rate_limited: true }], PARSED).drafted;
    expect(limited).toEqual({ ok: false, error: { code: 'rate_limited' } });
  });

  it('has no reply from a session that said nothing', async () => {
    expect(await speak([{ outcome: 'error' }], PARSED).drafted).toEqual({
      ok: false,
      error: { code: 'no_reply', outcome: 'error' },
    });
  });
});
