import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NO_JSON } from '@elvaria/runner-core';

import { reply } from './__fixtures__/kingdom.ts';
import { AMENDMENT_DECISION_JSON_SCHEMA, amendmentCheck } from './amendment.ts';
import { QUEST_DRAFT_JSON_SCHEMA, checkReply, checkTextReply, forTheCli } from './reply.ts';
import { MEMO_TRIAGE_JSON_SCHEMA } from './triage-memos.ts';

const contractFile = (name: string): string =>
  path.join(import.meta.dirname, '..', '..', '..', 'docs', 'schemas', `${name}.schema.json`);

const CONTRACT = contractFile('quest-draft');

/** What a schema sent with --json-schema may not have at its top (Claude Code 2.1.319 and 2.1.322). */
const TOP_REFUSED = ['allOf', 'anyOf', 'oneOf', '$schema'];

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

  // Claude Code 2.1.322 refused the amendment's schema for its top `allOf` (M2, 2026-11-14); deeper ones it takes.
  it('drops allOf, anyOf and oneOf at the top only', () => {
    const deep = { allOf: [{ required: ['a'] }], anyOf: [{}], oneOf: [{}] };
    expect(forTheCli({ type: 'object', ...deep, properties: { x: deep } })).toEqual({
      type: 'object',
      properties: { x: deep },
    });
    expect(forTheCli(['allOf'])).toEqual(['allOf']);
  });

  it.each([
    ['quest-draft', QUEST_DRAFT_JSON_SCHEMA],
    ['memo-triage', MEMO_TRIAGE_JSON_SCHEMA],
    ['amendment-decision', AMENDMENT_DECISION_JSON_SCHEMA],
  ])('sends the %s schema as an object with no combinator nor $schema at its top', (_, schema) => {
    expect(schema.type).toBe('object');
    expect(Object.keys(schema).filter((key) => TOP_REFUSED.includes(key))).toEqual([]);
  });

  it('gives the author the amendment-decision contract less its rules, which zod still holds', async () => {
    const { examples, $schema, allOf, ...rest } = JSON.parse(
      await readFile(contractFile('amendment-decision'), 'utf8'),
    ) as Record<string, unknown>;
    expect([examples, $schema, allOf].every((value) => value !== undefined)).toBe(true);
    expect(AMENDMENT_DECISION_JSON_SCHEMA).toEqual(rest);
    const base = { version: 1, note: 'x', ask: [] };
    expect(amendmentCheck({ ...base, decision: 'accepted' }).ok).toBe(false);
    expect(amendmentCheck({ ...base, decision: 'rejected', description: 'y' }).ok).toBe(false);
    expect(amendmentCheck({ ...base, decision: 'accepted', description: 'y' }).ok).toBe(true);
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

  it('tells the shared retry what is wrong (session.ts), and nothing when the reply can be used', () => {
    expect(checkReply(reply('link-check')).ok).toBe(true);
    expect(checkReply(reply('two-questions'))).toEqual({
      ok: false,
      issues: ['drafts.1.question: the Chancellor asks at most one question'],
    });
  });
});
