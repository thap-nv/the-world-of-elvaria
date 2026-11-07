// The handover letter (ADR 0010, implementation-plan §2.4). The character writes it in the owner's language
// under fixed English headings, because the runner reads one of them back: a question for the owner goes in the
// Question section and the session ends; every adapter turns that section into RunResult.question.
import { readTextFile } from '@elvaria/store';

/** The headings of `prompts/handover.md`, in order. */
export const HANDOVER_SECTIONS = [
  'Where I am',
  'Done',
  'Not done',
  'Tried and failed',
  'Decisions taken',
  'Next step',
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
