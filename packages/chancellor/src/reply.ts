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

/**
 * Combinators Claude Code 2.1.322 refuses at the top of the schema, before any model call: it becomes a tool's input
 * schema, and the API answers `400 … input_schema does not support oneOf, allOf, or anyOf at the top level` (live run
 * M2 of 2026-11-14, the amendment's author: zod's rules of amendment-decision are an `allOf`). Deeper down the CLI
 * takes them (the draft and the triage run with them), so only the top loses them; what they said is checked by the
 * reply's zod schema when the reply comes back (fix/amendment-schema).
 */
const NOT_AT_THE_TOP: ReadonlySet<string> = new Set(['allOf', 'anyOf', 'oneOf']);

/** The schema without the draft-07 keywords, at every depth. */
function withoutDraft07(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutDraft07);
  if (typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !NOT_IN_DRAFT_07.has(key))
      .map(([key, value]) => [key, withoutDraft07(value)]),
  );
}

/** The schema as the CLI takes it: no draft-07 keyword at any depth, no combinator at the top. */
export function forTheCli(schema: unknown): unknown {
  const plain = withoutDraft07(schema);
  if (typeof plain !== 'object' || plain === null || Array.isArray(plain)) return plain;
  return Object.fromEntries(Object.entries(plain).filter(([key]) => !NOT_AT_THE_TOP.has(key)));
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
