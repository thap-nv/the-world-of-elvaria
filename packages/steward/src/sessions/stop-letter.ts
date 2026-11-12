// The letter the Steward writes when a session was cut and the territory's hook refused its work (implementation-plan
// §3.3, ADR 0010, P1-55). In the phase-1 re-run two such quests (Q2-0, Q2-d1) reached the infirmary with a plot full of
// staged work and no `handover.md`: the session was cut before it wrote one, so the next session started blind. The
// letter is minimal and says only what the Steward knows (the files, the hook's last words, where the copy of the work
// is); it follows the template's headings so the next session fills them in, and a letter the character did write is
// never touched.
import { writeFileAtomic } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';
import type { CommitOutcome } from '@elvaria/runner-core';

import { handoverPath, readHandover } from '../files.ts';
import type { Context } from '../context.ts';

/** A commit the territory's hook refused, as the plot reports it with a rescue folder. */
export type Refusal = Extract<CommitOutcome, { readonly status: 'refused' }>;

/** At most this many paths in the letter; the patch file has them all. */
const FILES_LISTED = 30;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `a.ts` and `b.ts`, one to a line, and how many more. */
function listOf(files: readonly string[]): string {
  const more = files.length - FILES_LISTED;
  const lines = files.slice(0, FILES_LISTED).map((file) => `- ${file}`);
  return [...lines, ...(more > 0 ? [`- … and ${more} more`] : [])].join('\n');
}

/** The letter's text; its headings are the handover template's (runner-core/prompts/handover.md). */
export function stopLetterOf(
  quest: Pick<Quest, 'id'>,
  by: { readonly character: string; readonly trip: string },
  refusal: Refusal,
): string {
  const { files = [] } = refusal;
  const copy =
    refusal.patch === undefined
      ? ''
      : ` A copy of it as a patch is in ${refusal.patch} (sessions cannot read it).`;
  return [
    `# Handover · ${quest.id}`,
    '',
    `<!-- Written by the Steward, not by ${by.character}: its session ended (${by.trip}) before a letter was written. -->`,
    '',
    '## Where I am',
    '',
    `The session ended (${by.trip}) and the territory's commit hook refused the work it left. That work is in the plot, staged and not committed.${copy}`,
    '',
    '## Done',
    '',
    files.length === 0
      ? 'Nothing was committed. The plot holds the changes of the cut session.'
      : `Nothing was committed. The plot holds changes to ${String(files.length)} file(s):\n\n${listOf(files)}`,
    '',
    '## Not done',
    '',
    'Not known: read the quest, then the changes in the plot (`git status`, `git diff --cached`).',
    '',
    '## Tried and failed',
    '',
    "The territory's commit hook refused the commit. The end of its output:",
    '',
    '```text',
    refusal.detail,
    '```',
    '',
    '## Decisions taken',
    '',
    'None recorded: the session was cut before it wrote any.',
    '',
    '## Next step',
    '',
    'Fix what the hook complains about in the files above, or finish the work first, then write this letter in full.',
    '',
    '## Question',
    '',
  ].join('\n');
}

/**
 * Writes the letter after a commit the hook refused, unless the quest has one with something in it. A letter that
 * cannot be written costs a line in the log, never the move to the infirmary.
 */
export async function writeStopLetter(
  ctx: Context,
  quest: Pick<Quest, 'id'>,
  by: { readonly character: string; readonly trip: string },
  refusal: Refusal,
): Promise<void> {
  try {
    const letter = await readHandover(ctx.root, quest.id);
    if (letter !== null && letter.trim() !== '') return;
    await writeFileAtomic(handoverPath(ctx.root, quest.id), stopLetterOf(quest, by, refusal));
    ctx.deps.log.warn(`steward: ${quest.id}: ${by.character} left no handover.md: wrote a minimal one`);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no minimal handover.md: ${messageOf(error)}`);
  }
}
