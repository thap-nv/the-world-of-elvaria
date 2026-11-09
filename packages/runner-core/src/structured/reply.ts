// A reply in text where the CLI has no JSON Schema flag (implementation-plan §3.14 `structured_output:
// prompt_and_parse`, ADR 0021): the schema goes into the system part of the prompt, the JSON object is cut out of the
// session's last text, the caller's own check (zod and the rules JSON Schema cannot say) names what is wrong, and one
// more session is told so. Moved here from the Chancellor (P1-13) so the judge's verdict takes the same road (P1-33).
import type { JsonSchema } from '../runner/types.ts';

/** Folder of the second session, under the first one's run folder: its own prompt, settings and output. */
export const RETRY_DIR = 'retry';

/** What a text with no JSON object in it is told; a session that said nothing said no JSON either. */
export const NO_JSON = '(reply): no JSON object in the text';

export type ReplyCheck<T> = { readonly ok: true; readonly value: T } | ReplyIssues;
export interface ReplyIssues {
  readonly ok: false;
  /** `path: message`, in English: shown to the owner, and to the model when it tries again. */
  readonly issues: readonly string[];
}

/** One issue of a schema check, as zod reports it. */
export interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** `path: message` per issue; an issue of the reply as a whole says `(reply)`. */
export const issueLines = (issues: readonly SchemaIssue[]): string[] =>
  issues.map((issue) => `${issue.path.map(String).join('.') || '(reply)'}: ${issue.message}`);

/** The JSON object in a text reply: the whole text, or the part from its first `{` to its last `}`. */
export function jsonOfText(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

/** A text reply against the caller's check: a text without a JSON object is a reply that cannot be used. */
export function checkTextReply<T>(
  text: string | undefined,
  check: (value: unknown) => ReplyCheck<T>,
): ReplyCheck<T> {
  const value = jsonOfText(text);
  return value === undefined ? { ok: false, issues: [NO_JSON] } : check(value);
}

/** What the system part adds for a tribe without structured output. */
export const replyFormatBlock = (schema: JsonSchema): string =>
  [
    '# Reply format',
    '',
    'Your whole reply is one JSON object that is valid against this JSON Schema, with no other text:',
    '',
    JSON.stringify(schema),
  ].join('\n');

/** What the next session is told when a text reply could not be used. */
export const retryBlock = (problems: readonly string[]): string =>
  [
    '# Your previous reply',
    '',
    'It could not be used:',
    ...problems.map((line) => `- ${line}`),
    '',
    'Reply again with the JSON object only.',
  ].join('\n');
