// The pure part of prompt_and_parse (implementation-plan §3.14): the format block, the JSON cut out of a text, the
// issues named for the retry. Moved from the Chancellor (P1-13) in P1-33; its specs moved with it.
import { describe, expect, it } from 'vitest';

import { NO_JSON, checkTextReply, issueLines, jsonOfText, replyFormatBlock, retryBlock } from './reply.ts';
import type { ReplyCheck } from './reply.ts';

const versioned = (value: unknown): ReplyCheck<{ version: number }> =>
  typeof (value as { version?: unknown }).version === 'number'
    ? { ok: true, value: value as { version: number } }
    : { ok: false, issues: ['version: required'] };

describe('a reply in text (§3.14)', () => {
  it('cuts the JSON out of a text reply', () => {
    expect(jsonOfText('{"version": 1}')).toEqual({ version: 1 });
    expect(jsonOfText('Here it is:\n```json\n{"drafts": []}\n```')).toEqual({ drafts: [] });
    expect(jsonOfText('No JSON here.')).toBeUndefined();
    expect(jsonOfText('} backwards {')).toBeUndefined();
    expect(jsonOfText('{ torn')).toBeUndefined();
    expect(jsonOfText('{ "a": }')).toBeUndefined();
    expect(jsonOfText(undefined)).toBeUndefined();
  });

  it("checks a text reply with the caller's check, and names one without JSON", () => {
    expect(checkTextReply('{"version": 2}', versioned)).toEqual({ ok: true, value: { version: 2 } });
    expect(checkTextReply('{"v": 2}', versioned)).toEqual({ ok: false, issues: ['version: required'] });
    expect(checkTextReply('I would rather not.', versioned)).toEqual({ ok: false, issues: [NO_JSON] });
    expect(checkTextReply(undefined, versioned)).toEqual({ ok: false, issues: [NO_JSON] });
  });

  it('says each issue at its path, the reply as a whole at none', () => {
    expect(
      issueLines([
        { path: ['drafts', 1, 'question'], message: 'one question at most' },
        { path: [], message: 'expected object' },
      ]),
    ).toEqual(['drafts.1.question: one question at most', '(reply): expected object']);
  });

  it('puts the schema in the prompt, and names what went wrong for the retry', () => {
    const schema = { type: 'object', required: ['result'] };
    expect(replyFormatBlock(schema)).toBe(
      `# Reply format\n\nYour whole reply is one JSON object that is valid against this JSON Schema, with no other text:\n\n${JSON.stringify(schema)}`,
    );
    expect(retryBlock(['drafts: required'])).toBe(
      '# Your previous reply\n\nIt could not be used:\n- drafts: required\n\nReply again with the JSON object only.',
    );
  });
});
