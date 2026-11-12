// The handover letter (ADR 0010, implementation-plan §2.4). The character writes it in the owner's language
// under fixed English headings, because two of them are read back: a question for the owner goes in the Question
// section and the session ends, and every adapter turns that section into RunResult.question; the Steward reads the
// Memos section when the run ends (memosOf, PS-02, ADR 0024), so RunResult and the adapters do not change.
import { readTextFile } from '@elvaria/store';
import type { MemoDraft } from '@elvaria/domain';

/** The headings of `prompts/handover.md`, in order. */
export const HANDOVER_SECTIONS = [
  'Where I am',
  'Done',
  'Not done',
  'Tried and failed',
  'Decisions taken',
  'Next step',
  'Memos',
  'Question',
] as const;
export type HandoverSection = (typeof HANDOVER_SECTIONS)[number];

const HEADING = /^##\s+(.+?)\s*#*\s*$/;
/** What a character leaves in a Question section it does not use (the template says: leave it empty). */
const NO_QUESTION = /^(?:[-–—_.*]*|none|no|n\/a|nothing|không|không có)\.?$/i;

/** The text under `## <section>` up to the next `##` heading, trimmed; undefined when absent or empty. */
export function sectionOf(letter: string, section: HandoverSection): string | undefined {
  const lines = letter.split(/\r?\n/);
  const wanted = section.toLowerCase();
  const start = lines.findIndex((line) => HEADING.exec(line)?.[1]?.toLowerCase() === wanted);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => HEADING.test(line));
  const text = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return text === '' ? undefined : text;
}

/** The question the character asks the owner, if any. */
export function questionOf(letter: string): string | undefined {
  const text = sectionOf(letter, 'Question');
  return text === undefined || NO_QUESTION.test(text) ? undefined : text;
}

/** The memos of a letter, and the lines of its Memos section that follow no grammar the assignee prompt gives. */
export interface LetterMemos {
  readonly memos: readonly MemoDraft[];
  readonly malformed: readonly string[];
}

/** `- <kind>: <text>`, the kind snake_case; `refs: <path>, <path>` at the end of the text is optional. */
const MEMO_LINE = /^[-*]\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(\S.*)$/;
const REFS = /^(.*\S)\s+refs\s*:\s*(.*)$/is;
/** A memo's text may go on in an indented line, as a Markdown list item does. */
const CONTINUED = /^\s+\S/;

const refsOf = (text: string): string[] =>
  text
    .split(',')
    .map((ref) => ref.trim().replace(/^`+|`+$/g, ''))
    .filter((ref) => ref !== '');

function draftOf(kind: string, text: string): MemoDraft {
  const refs = REFS.exec(text);
  const body = (refs?.[1] ?? text).trim();
  return { kind: kind.toLowerCase(), body, refs: refsOf(refs?.[2] ?? '') };
}

/** What a character leaves on a line with no memo: a dash, or "none" with or without its bullet. */
const noMemo = (line: string): boolean => NO_QUESTION.test(line.replace(/^[-*]\s*/, '').trim());

/**
 * The memos in the Memos section of a letter, one per `- <kind>: <text> refs: <paths>` line (assignee.md, law 8). A
 * line with no memo (`-`, as fakeLetter writes, or `none`) is nothing; any other line that follows no memo is left out
 * and returned in `malformed`, so the Steward warns and the session's end stands (PS-02).
 */
export function memosOf(letter: string): LetterMemos {
  const section = sectionOf(letter, 'Memos');
  const lines: { kind: string; text: string }[] = [];
  const malformed: string[] = [];
  for (const line of section?.split(/\r?\n/) ?? []) {
    const memo = MEMO_LINE.exec(line.trim());
    const last = lines.at(-1);
    if (memo?.[1] !== undefined && memo[2] !== undefined) lines.push({ kind: memo[1], text: memo[2] });
    else if (last !== undefined && CONTINUED.test(line)) last.text = `${last.text} ${line.trim()}`;
    else if (line.trim() !== '' && !noMemo(line)) malformed.push(line.trim());
  }
  return { memos: lines.map(({ kind, text }) => draftOf(kind, text)), malformed };
}

/** A folder on the way is a file: Windows says ENOENT, which readTextFile reads as "missing"; POSIX says ENOTDIR. */
const notADirectory = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOTDIR';

/** Reads the letter after a session; a missing letter (or none expected) asks nothing, on every OS. */
export async function readQuestion(file: string | undefined): Promise<string | undefined> {
  if (file === undefined) return undefined;
  try {
    const letter = await readTextFile(file);
    return letter === undefined ? undefined : questionOf(letter);
  } catch (error) {
    if (notADirectory(error)) return undefined;
    throw error;
  }
}
