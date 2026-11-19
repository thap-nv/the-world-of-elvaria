// The parser of scripture (PS-12, temple-first plan "Văn phạm", DB2, DB3): one lesson is one Markdown list item on one
// line, `- [L_…] {key=value,value key=value} sentence`, the id and the scope head optional. Headings and blank lines are
// layout; any other text is stray and never loads. The parser is tolerant: a bad line carries its flaws and never
// spoils another line, and no input makes it throw.
import { ClassIdSchema, LESSON_ID_PATTERN, TagIdSchema, TribeIdSchema } from '../core/ids.ts';
import { FailKindSchema, RoleSchema } from '../schema/common.ts';
import { LESSON_SCOPE_KEYS, LessonPlatformSchema, LessonTerritorySchema } from '../schema/lesson/scope.ts';
import type { LessonId } from '../core/ids.ts';
import type { FailKind } from '../schema/common.ts';
import type { LessonScope, LessonScopeKey } from '../schema/lesson/scope.ts';
import type { LessonFlaw } from './issues.ts';

/** One lesson of a scripture file, as written; `flaws` says what the grammar found wrong with it. */
export interface ScriptureLine {
  /** A character slug, or `temple` for the shared scripture. */
  readonly owner: string;
  /** Its line in the file, from 1. */
  readonly line: number;
  readonly id: LessonId | null;
  /** The scope keys the head gave with values it could read; empty without a head. */
  readonly scope: LessonScope;
  readonly fail_kind: FailKind | null;
  /** Where the lesson was measured (lesson-sharing S5): recorded, never a filter. */
  readonly cli: string | null;
  /** The sentence: all a prompt ever carries of the line. */
  readonly text: string;
  readonly flaws: readonly LessonFlaw[];
}

export interface ParsedScripture {
  readonly lessons: readonly ScriptureLine[];
  /** The lines, from 1, that hold text that is neither a lesson, a heading nor blank. */
  readonly stray: readonly number[];
}

// Control characters but the tab, format characters (zero-width, bidirectional, tags), private use, lone surrogates,
// line and paragraph separators: what a reader of the file or of a rendered page cannot see (lesson-sharing T4 and
// §13, the rules-file backdoor).
const HIDDEN = /(?!\t)[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u;
const HEADING = /^#{1,6}(?:\s|$)/;
// `s`: a carriage return inside the line stays in the item, where HIDDEN finds it.
const ITEM = /^-(?:[ \t]+(.*))?$/su;
const PAIR = /^([a-z_]+)=(.+)$/;

// The same item schemas as LessonScopeSchema's lists, so a value read here is one the contract accepts.
const SCOPE_ITEMS = {
  role: RoleSchema,
  class: ClassIdSchema,
  tribe: TribeIdSchema,
  os: LessonPlatformSchema,
  territory: LessonTerritorySchema,
  tag: TagIdSchema,
} as const;

interface Head {
  readonly scope: Partial<Record<LessonScopeKey, string[]>>;
  fail_kind: FailKind | null;
  cli: string | null;
  readonly flaws: LessonFlaw[];
}

const isScopeKey = (key: string): key is LessonScopeKey =>
  (LESSON_SCOPE_KEYS as readonly string[]).includes(key);

/** `fail_kind` and `cli` take one value each. */
function readSingle(head: Head, key: 'fail_kind' | 'cli', values: readonly string[]): void {
  const [value] = values;
  if (values.length !== 1 || value === undefined) {
    head.flaws.push({ code: 'bad_head', key });
    return;
  }
  if (key === 'cli') {
    head.cli = value;
    return;
  }
  const kind = FailKindSchema.safeParse(value);
  if (kind.success) head.fail_kind = kind.data;
  else head.flaws.push({ code: 'unknown_value', key, value });
}

function readPair(head: Head, token: string, seen: Set<string>): void {
  const pair = PAIR.exec(token);
  const [, key = '', list = ''] = pair ?? [];
  const values = list.split(',');
  if (pair === null || values.includes('') || seen.has(key)) {
    head.flaws.push(pair === null ? { code: 'bad_head', value: token } : { code: 'bad_head', key });
    return;
  }
  seen.add(key);
  if (key === 'fail_kind' || key === 'cli') {
    readSingle(head, key, values);
    return;
  }
  if (!isScopeKey(key)) {
    head.flaws.push({ code: 'unknown_key', key });
    return;
  }
  const read = values.filter((value) => SCOPE_ITEMS[key].safeParse(value).success);
  for (const value of values.filter((each) => !read.includes(each)))
    head.flaws.push({ code: 'unknown_value', key, value });
  if (read.length > 0) head.scope[key] = read;
}

function readHead(inner: string): Head {
  const head: Head = { scope: {}, fail_kind: null, cli: null, flaws: [] };
  const seen = new Set<string>();
  for (const token of inner.split(/\s+/).filter((each) => each !== '')) readPair(head, token, seen);
  return head;
}

/** `[L_…]` at the start of an item: the id, or a flaw when it is not one; the rest of the item. */
function splitId(body: string): { id: LessonId | null; rest: string; flaws: LessonFlaw[] } {
  if (!body.startsWith('[L_')) return { id: null, rest: body, flaws: [] };
  const close = body.indexOf(']');
  if (close < 0) return { id: null, rest: body, flaws: [{ code: 'bad_id' }] };
  const raw = body.slice(1, close);
  const rest = body.slice(close + 1).trim();
  if (!LESSON_ID_PATTERN.test(raw)) return { id: null, rest, flaws: [{ code: 'bad_id', value: raw }] };
  // The pattern is LessonIdSchema's own.
  return { id: raw as LessonId, rest, flaws: [] };
}

function lessonOf(owner: string, line: number, raw: string, body: string): ScriptureLine {
  const { id, rest, flaws } = splitId(body);
  const close = rest.startsWith('{') ? rest.indexOf('}') : -1;
  const head = close < 0 ? readHead('') : readHead(rest.slice(1, close));
  const text = (close < 0 ? rest : rest.slice(close + 1)).trim();
  const all = [
    ...flaws,
    ...(rest.startsWith('{') && close < 0 ? [{ code: 'bad_head' as const }] : []),
    ...head.flaws,
    ...(text === '' ? [{ code: 'empty_text' as const }] : []),
    ...(HIDDEN.test(raw) ? [{ code: 'hidden_char' as const }] : []),
  ];
  // Every value in head.scope passed the item schema of its key in LessonScopeSchema.
  const scope = head.scope as LessonScope;
  return { owner, line, id, scope, fail_kind: head.fail_kind, cli: head.cli, text, flaws: all };
}

/** The lessons of a scripture file, in file order; `owner` is the character's slug or `temple`. */
export function parseScripture(text: string, owner: string): ParsedScripture {
  const lessons: ScriptureLine[] = [];
  const stray: number[] = [];
  // A file saved with a byte-order mark would otherwise hide its first lesson behind a hidden character.
  const lines = text.replace(/^\uFEFF/u, '').split('\n');
  lines.forEach((full, index) => {
    const raw = full.endsWith('\r') ? full.slice(0, -1) : full;
    const trimmed = raw.trim();
    if (trimmed === '' || HEADING.test(trimmed)) return;
    const item = ITEM.exec(raw.trimEnd());
    if (item === null) stray.push(index + 1);
    else lessons.push(lessonOf(owner, index + 1, raw, (item[1] ?? '').trim()));
  });
  return { lessons, stray };
}
