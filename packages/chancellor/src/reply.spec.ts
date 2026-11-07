import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { reply } from './__fixtures__/kingdom.ts';
import {
  QUEST_DRAFT_JSON_SCHEMA,
  checkReply,
  checkTextReply,
  jsonOfText,
  replyFormatBlock,
  retryBlock,
} from './reply.ts';

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
  it('gives the CLI the quest-draft contract of docs/schemas, without its examples', async () => {
    const { examples, ...contract } = JSON.parse(await readFile(CONTRACT, 'utf8')) as Record<string, unknown>;
    expect(examples).toBeDefined();
    expect(QUEST_DRAFT_JSON_SCHEMA).toEqual(contract);
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

  it('cuts the JSON out of a text reply', () => {
    expect(jsonOfText('{"version": 1}')).toEqual({ version: 1 });
    expect(jsonOfText('Here it is:\n```json\n{"drafts": []}\n```')).toEqual({ drafts: [] });
    expect(jsonOfText('No JSON here.')).toBeUndefined();
    expect(jsonOfText('} backwards {')).toBeUndefined();
    expect(jsonOfText('{ torn')).toBeUndefined();
    expect(jsonOfText('{ "a": }')).toBeUndefined();
  });

  it('checks a text reply, and names one without JSON', () => {
    expect(checkTextReply(JSON.stringify(reply('vague'))).ok).toBe(true);
    expect(checkTextReply('I would rather not.')).toEqual({
      ok: false,
      issues: ['(reply): no JSON object in the text'],
    });
  });

  it('puts the schema in the prompt of a tribe that answers in text, and names what went wrong', () => {
    expect(replyFormatBlock()).toContain(JSON.stringify(QUEST_DRAFT_JSON_SCHEMA));
    expect(retryBlock(['drafts: required'])).toBe(
      '# Your previous reply\n\nIt could not be used:\n- drafts: required\n\nReply again with the JSON object only.',
    );
  });
});
