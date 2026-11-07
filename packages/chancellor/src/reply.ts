// The Chancellor's reply (implementation-plan §3.11, §3.14 `structured_output`): the quest-draft contract, given to
// a CLI that has a JSON Schema flag, and the zod schema that checks whatever comes back, with the rules JSON Schema
// cannot say (one question, refs that name other drafts). A tribe without the flag gets the schema in its prompt
// and answers in text; the JSON is cut out of that text.
import { QuestDraftFileSchema, contractOf } from '@elvaria/domain';
import type { QuestDraftFile } from '@elvaria/domain';
import type { JsonSchema } from '@elvaria/runner-core';

/**
 * Keywords Claude Code 2.1.319 refuses in --json-schema, before any model call (live run of P1-13): it validates
 * the schema as draft-07 in strict mode, so the 2020-12 `$schema` is "no schema with key or ref" and `minContains`
 * an "unknown keyword". `contains` goes with them, or it would demand a question. What they said, at most one
 * question per reply, is checked by checkReply (QuestDraftFileSchema) when the reply comes back.
 */
const NOT_IN_DRAFT_07: ReadonlySet<string> = new Set(['$schema', 'contains', 'minContains', 'maxContains']);

/** The schema without those keywords, at every depth. */
export function forTheCli(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forTheCli);
  if (typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !NOT_IN_DRAFT_07.has(key))
      .map(([key, value]) => [key, forTheCli(value)]),
  );
}

/** `--json-schema` of the Chancellor's session: docs/schemas/quest-draft.schema.json, less what the CLI refuses. */
export const QUEST_DRAFT_JSON_SCHEMA = forTheCli(
  contractOf('quest-draft', QuestDraftFileSchema),
) as JsonSchema;

export type ReplyCheck = { readonly ok: true; readonly value: QuestDraftFile } | ReplyIssues;
export interface ReplyIssues {
  readonly ok: false;
  /** `path: message`, in English: shown to the owner, and to the model when it tries again. */
  readonly issues: readonly string[];
}

const issues = (...lines: string[]): ReplyIssues => ({ ok: false, issues: lines });

/** The reply against the quest-draft schema. */
export function checkReply(value: unknown): ReplyCheck {
  const parsed = QuestDraftFileSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return issues(
    ...parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(reply)'}: ${issue.message}`,
    ),
  );
}

/** The JSON object in a text reply: the whole text, or the part from its first `{` to its last `}`. */
export function jsonOfText(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

/** A text reply against the schema: a text without a JSON object is a reply that cannot be used. */
export function checkTextReply(text: string): ReplyCheck {
  const value = jsonOfText(text);
  return value === undefined ? issues('(reply): no JSON object in the text') : checkReply(value);
}

/** What the system prompt adds for a tribe without structured output (§3.14). */
export const replyFormatBlock = (): string =>
  [
    '# Reply format',
    '',
    'Your whole reply is one JSON object that is valid against this JSON Schema, with no other text:',
    '',
    JSON.stringify(QUEST_DRAFT_JSON_SCHEMA),
  ].join('\n');

/** What the user part adds when a text reply could not be used and the tribe tries once more. */
export const retryBlock = (problems: readonly string[]): string =>
  [
    '# Your previous reply',
    '',
    'It could not be used:',
    ...problems.map((line) => `- ${line}`),
    '',
    'Reply again with the JSON object only.',
  ].join('\n');
