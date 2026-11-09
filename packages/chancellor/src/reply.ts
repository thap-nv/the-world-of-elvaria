// The Chancellor's reply (implementation-plan §3.11, §3.14 `structured_output`): the quest-draft contract, given to
// a CLI that has a JSON Schema flag, and the zod schema that checks whatever comes back, with the rules JSON Schema
// cannot say (one question, refs that name other drafts). A tribe without the flag gets the schema in its prompt and
// answers in text: that road is runner-core's (spawnParsed, P1-33), shared with the judge's verdict.
import { QuestDraftFileSchema, contractOf } from '@elvaria/domain';
import { checkTextReply as checkText, issueLines } from '@elvaria/runner-core';
import type { QuestDraftFile } from '@elvaria/domain';
import type { JsonSchema, ReplyCheck } from '@elvaria/runner-core';

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

export type DraftCheck = ReplyCheck<QuestDraftFile>;

/** The reply against the quest-draft schema. */
export function checkReply(value: unknown): DraftCheck {
  const parsed = QuestDraftFileSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: issueLines(parsed.error.issues) };
}

/** A text reply against the schema: a text without a JSON object is a reply that cannot be used. */
export const checkTextReply = (text: string | undefined): DraftCheck => checkText(text, checkReply);

/** What spawnParsed asks before it tries again: the issues of a reply, none when it can be used. */
export const replyIssuesOf = (value: unknown): readonly string[] => {
  const checked = checkReply(value);
  return checked.ok ? [] : checked.issues;
};
