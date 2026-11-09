import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NO_JSON } from '@elvaria/runner-core';

import { reply } from './__fixtures__/kingdom.ts';
import { QUEST_DRAFT_JSON_SCHEMA, checkReply, checkTextReply, forTheCli, replyIssuesOf } from './reply.ts';

const CONTRACT = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'docs',
  'schemas',
  'quest-draft.schema.json',
);

describe('the reply (§3.11, §3.14)', () => {
  it('gives the CLI the quest-draft contract of docs/schemas, less its examples and what draft-07 lacks', async () => {
    const { examples, ...contract } = JSON.parse(await readFile(CONTRACT, 'utf8')) as Record<string, unknown>;
    expect(examples).toBeDefined();
    const { drafts } = contract.properties as { drafts: Record<string, unknown> };
    const { contains, minContains, maxContains, ...plainDrafts } = drafts;
    expect([contains, minContains, maxContains]).toEqual([{ required: ['question'] }, 0, 1]);
    const { $schema, ...rest } = contract;
    expect($schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(QUEST_DRAFT_JSON_SCHEMA).toEqual({
      ...rest,
      properties: { ...(contract.properties as object), drafts: plainDrafts },
    });
  });

  it('drops the refused keywords at every depth, and leaves the rest alone', () => {
    expect(
      forTheCli({
        $schema: 'x',
        a: [{ contains: {}, b: 1 }, 'c', null],
        d: { minContains: 0, maxContains: 1 },
      }),
    ).toEqual({ a: [{ b: 1 }, 'c', null], d: {} });
  });

  it('reads a structured output as drafts', () => {
    const checked = checkReply(reply('link-check'));
    expect(checked.ok && checked.value.drafts.map(({ ref, tier }) => [ref, tier])).toEqual([
      ['d1', 'script'],
    ]);
  });

  it('refuses a second question, and anything that is not a reply', () => {
    expect(checkReply(reply('two-questions'))).toEqual({
      ok: false,
      issues: ['drafts.1.question: the Chancellor asks at most one question'],
    });
    const none = checkReply('ok');
    expect(none.ok).toBe(false);
    expect(!none.ok && none.issues[0]).toMatch(/^\(reply\): /);
  });

  // Cutting the JSON out, the format block and the retry block are runner-core's now (structured/reply.spec.ts).
  it('checks a text reply with the shared cut, and names one without JSON', () => {
    expect(checkTextReply(`Here:\n${JSON.stringify(reply('vague'))}`).ok).toBe(true);
    expect(checkTextReply('I would rather not.')).toEqual({ ok: false, issues: [NO_JSON] });
  });

  it('tells the shared retry what is wrong, and nothing when the reply can be used', () => {
    expect(replyIssuesOf(reply('link-check'))).toEqual([]);
    expect(replyIssuesOf(reply('two-questions'))).toEqual([
      'drafts.1.question: the Chancellor asks at most one question',
    ]);
  });
});
