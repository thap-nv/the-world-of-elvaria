import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadPromptTemplates } from '@elvaria/runner-core';
import type { TriageContext } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHANCELLOR_CLASS_ENTRY, CONTEXT, NATIVE, PARSED } from './__fixtures__/kingdom.ts';
import { DOCS, SOURCE, draftOf, memoOf, triageOf } from './__fixtures__/memos.ts';
import { ANSWER_TOKENS, scriptedRunner } from './__fixtures__/runner.ts';
import { MEMO_TRIAGE_JSON_SCHEMA, triageCheckOf, triageMemos } from './triage-memos.ts';
import type { Answer } from './__fixtures__/runner.ts';
import type { ChancellorChoice } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const LINK = memoOf('m_20261112_aaaaaa', 'docs/guide.md có link chết.', ['docs/guide.md']);
const FAVICON = memoOf('m_20261112_cccccc', 'apps/web chưa có favicon.', []);

const { utterance: _, mana: __, ...base } = CONTEXT;
const context: TriageContext = {
  ...base,
  memos: [{ memo: LINK, source: SOURCE }, { memo: FAVICON }],
  quests: [DOCS],
};

const GOOD = triageOf(
  [
    {
      memo: LINK.id,
      action: 'merge',
      quest: DOCS.id,
      addendum: 'Sửa link.',
      ask: [],
      note: 'Cùng vùng docs.',
    },
    { memo: FAVICON.id, action: 'new_quest', draft_ref: 'd1', ask: [], note: 'Việc riêng.' },
  ],
  [draftOf('d1'), draftOf('d2', { tags: ['ui'] })],
);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'elvaria triage ạ '));
});
afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

function triage(answers: readonly Answer[], choice: ChancellorChoice = NATIVE, signal?: AbortSignal) {
  const runner = scriptedRunner(answers);
  const session = {
    runner,
    choice,
    characterClass: CHANCELLOR_CLASS_ENTRY,
    templates,
    run_dir: path.join(dir, 'triage-1'),
    env: { ELVARIA_ROLE: 'chancellor' },
  };
  return { runner, triaged: triageMemos(context, session, signal) };
}

describe('triageMemos (PS-03b)', () => {
  it('asks one session with the triage schema for the whole batch, and screens its drafts', async () => {
    const { runner, triaged } = triage([{ structured: GOOD }]);
    const result = await triaged;
    expect(result.ok && result.value).toMatchObject({
      decisions: GOOD.decisions,
      drafts: { kept: [{ ref: 'd1' }], dropped: [{ ref: 'd2', reason: 'unknown_tag' }] },
      session_ids: ['chancellor-1'],
      tokens: ANSWER_TOKENS,
    });
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]).toMatchObject({ role: 'chancellor', structured: MEMO_TRIAGE_JSON_SCHEMA });
    expect(runner.requests[0]?.prompt.user).toContain(LINK.id);
  });

  it('asks once more, in text, for a reply that leaves a memo out', async () => {
    const short = triageOf([GOOD.decisions[0]]);
    const { runner, triaged } = triage(
      [{ text: JSON.stringify(short) }, { text: JSON.stringify(GOOD) }],
      PARSED,
    );
    const result = await triaged;
    expect(result.ok && result.value.session_ids).toEqual(['chancellor-1', 'chancellor-2']);
    expect(runner.requests[1]?.prompt.user).toContain(`decisions: no decision for memo ${FAVICON.id}`);
  });

  it('refuses a reply that names a memo outside the batch', async () => {
    const stray = {
      ...GOOD,
      decisions: [...GOOD.decisions, { ...GOOD.decisions[0], memo: 'm_20261112_zzzzzz' }],
    };
    expect(await triage([{ structured: stray }]).triaged).toEqual({
      ok: false,
      error: { code: 'invalid_reply', issues: ['decisions.2.memo: m_20261112_zzzzzz is not a memo below'] },
    });
    expect(triageCheckOf([LINK.id])({ version: 1 })).toMatchObject({ ok: false });
  });

  it('ends with the Steward: a session it was waiting on is killed', async () => {
    const stopping = new AbortController();
    const { triaged } = triage([{ hang: true }], NATIVE, stopping.signal);
    stopping.abort();
    expect(await triaged).toEqual({ ok: false, error: { code: 'stopped' } });
    const stopped = new AbortController();
    stopped.abort();
    expect(await triage([{ hang: true }], NATIVE, stopped.signal).triaged).toEqual({
      ok: false,
      error: { code: 'stopped' },
    });
  });

  it('says why there is no reply, as the owner’s words do', async () => {
    expect(await triage([{ rate_limited: true, outcome: 'error' }]).triaged).toEqual({
      ok: false,
      error: { code: 'rate_limited' },
    });
    expect(await triage([{ structured: { version: 1 } }]).triaged).toMatchObject({
      ok: false,
      error: { code: 'invalid_reply' },
    });
  });
});
