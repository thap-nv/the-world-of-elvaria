// The letter the Steward writes when a breaker cut an assignee's session and no letter is left (implementation-plan
// §3.3, ADR 0010, P1-55). In the phase-1 re-run two such quests (Q2-0, Q2-d1) reached the infirmary with a plot full of
// staged work and no `handover.md`: the session was cut before it wrote one, so the next session started blind. P1-55
// wrote one only when the territory's hook refused the work; in the PS-07 run two Claude sessions cut at their token
// ceiling (d5, d6) left none, and the next ones went on from git and the journal alone (gap 23 of the report). The
// letter is minimal and says only what the Steward knows (the trip, the files, its WIP commit or the copy of the work,
// the hook's last words); it follows the template's headings so the next session fills them in, and a letter the
// character did write is never touched.
import { writeFileAtomic } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';
import type { CommitOutcome } from '@elvaria/runner-core';

import { handoverPath, readHandover } from '../files.ts';
import type { Context } from '../context.ts';
import type { PlotCommit } from './commit.ts';

/** A commit the territory's hook refused, as the plot reports it with a rescue folder. */
export type Refusal = Extract<CommitOutcome, { readonly status: 'refused' }>;

/**
 * What a cut session left, as the Steward found it: the outcome of its WIP commit, or the commit its trip already was
 * (a refused submit, a patch the Steward could not apply, forbidden paths changed).
 */
export type StopLeft = PlotCommit | { readonly status: 'patch_refused'; readonly detail: string };

/** Who was cut, and by which breaker. */
interface Cut {
  readonly character: string;
  readonly trip: string;
}

/** At most this many paths in the letter; the patch file has them all. */
const FILES_LISTED = 30;

const DECISIONS = 'None recorded: the session was cut before it wrote any.';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `a.ts` and `b.ts`, one to a line, and how many more. */
function listOf(files: readonly string[]): string {
  const more = files.length - FILES_LISTED;
  const lines = files.slice(0, FILES_LISTED).map((file) => `- ${file}`);
  return [...lines, ...(more > 0 ? [`- … and ${more} more`] : [])].join('\n');
}

/** What the Steward writes under the template's headings; Decisions and Question say the same in every letter. */
interface Sections {
  readonly where: string;
  readonly done: string;
  readonly notDone: string;
  readonly tried: string;
  readonly next: string;
}

/** The letter's text; its headings are the handover template's (runner-core/prompts/handover.md). */
function letterOf(quest: Pick<Quest, 'id'>, by: Cut, sections: Sections): string {
  const { where, done, notDone, tried, next } = sections;
  const under = (heading: string, text: string): string[] => [`## ${heading}`, '', text, ''];
  return [
    `# Handover · ${quest.id}`,
    '',
    `<!-- Written by the Steward, not by ${by.character}: its session ended (${by.trip}) before a letter was written. -->`,
    '',
    ...under('Where I am', where),
    ...under('Done', done),
    ...under('Not done', notDone),
    ...under('Tried and failed', tried),
    ...under('Decisions taken', DECISIONS),
    ...under('Next step', next),
    '## Question',
    '',
  ].join('\n');
}

/** The letter after a commit the territory's hook refused (P1-55): the staged files, the copy, the hook's words. */
export function stopLetterOf(quest: Pick<Quest, 'id'>, by: Cut, refusal: Refusal): string {
  const { files = [] } = refusal;
  const copy =
    refusal.patch === undefined
      ? ''
      : ` A copy of it as a patch is in ${refusal.patch} (sessions cannot read it).`;
  return letterOf(quest, by, {
    where: `The session ended (${by.trip}) and the territory's commit hook refused the work it left. That work is in the plot, staged and not committed.${copy}`,
    done:
      files.length === 0
        ? 'Nothing was committed. The plot holds the changes of the cut session.'
        : `Nothing was committed. The plot holds changes to ${String(files.length)} file(s):\n\n${listOf(files)}`,
    notDone: 'Not known: read the quest, then the changes in the plot (`git status`, `git diff --cached`).',
    tried: [
      "The territory's commit hook refused the commit. The end of its output:",
      '',
      '```text',
      refusal.detail,
      '```',
    ].join('\n'),
    next: 'Fix what the hook complains about in the files above, or finish the work first, then write this letter in full.',
  });
}

const UNKNOWN_TRIED =
  'Not known: the session was cut before it said. The journal of the quest tells what it did.';
const FINISH =
  'Check the work above against the quest, finish what is left, and keep this letter up to date as you go.';

/** Where the work is and what was tried, for a cut whose work no hook refused. */
function placeOf(left: Exclude<StopLeft, Refusal>, trip: string): Pick<Sections, 'where' | 'tried' | 'next'> {
  const ended = `The session ended (${trip}) before it wrote a letter.`;
  const uncommitted = 'That work is in the plot, not committed.';
  switch (left.status) {
    case 'committed':
      return {
        where: `${ended} The Steward committed the work it left as WIP ${left.sha} on the quest's branch.`,
        tried: UNKNOWN_TRIED,
        next: FINISH,
      };
    case 'clean':
      return {
        where: `${ended} It left nothing uncommitted in the plot.`,
        tried: UNKNOWN_TRIED,
        next: FINISH,
      };
    case 'no_git':
      return {
        where: `${ended} The plot has no git: its files are as the session left them.`,
        tried: UNKNOWN_TRIED,
        next: FINISH,
      };
    case 'forbidden':
      return {
        where: `${ended} Its work changed paths under the territory's laws.forbidden_paths, so the Steward committed nothing. ${uncommitted}`,
        tried: `The work changed these forbidden paths:\n\n${listOf(left.paths)}`,
        next: `The owner looks at the plot first. Then undo the changes to the forbidden paths. ${FINISH}`,
      };
    case 'patch_refused':
      return {
        where: `${ended} The Steward could not apply the patch it left, so nothing was committed. ${uncommitted}`,
        tried: `The patch was refused: ${left.detail}`,
        next: `Make the patch's changes within the quest's paths, or drop them. ${FINISH}`,
      };
  }
}

/**
 * The letter after any other cut (gap 23 of the PS-07 report): the trip, where the work is, and the files the plot
 * changed since the quest started (`files`; undefined when git could not say).
 */
export function cutLetterOf(
  quest: Pick<Quest, 'id'>,
  by: Cut,
  left: Exclude<StopLeft, Refusal>,
  files: readonly string[] | undefined,
): string {
  const done =
    files === undefined
      ? 'Not known: git could not list the changes of the plot.'
      : files.length === 0
        ? 'No file differs from where the quest started.'
        : `The plot differs from where the quest started in ${String(files.length)} file(s), committed or not:\n\n${listOf(files)}`;
  return letterOf(quest, by, {
    ...placeOf(left, by.trip),
    done,
    notDone:
      'Not known: read the quest, then the work on its branch and in the plot (`git log`, `git status`, `git diff`).',
  });
}

/** What the Steward's own breakers say a session left, beside its WIP commit, which none of them tried. */
export interface UncommittedTrip {
  readonly refused?: Refusal | undefined;
  readonly patch?: string | undefined;
  readonly paths?: readonly string[] | undefined;
}

/** What a cut session left: its WIP commit, or the commit its trip already was; nothing when neither says. */
export function stopLeftOf(wip: PlotCommit | undefined, trip: UncommittedTrip): StopLeft | undefined {
  if (wip !== undefined) return wip;
  if (trip.refused !== undefined) return trip.refused;
  if (trip.patch !== undefined) return { status: 'patch_refused', detail: trip.patch };
  return trip.paths === undefined ? undefined : { status: 'forbidden', paths: trip.paths };
}

/** The files the quest's plot changed since it started, or undefined when git cannot say. */
async function filesOf(ctx: Context, quest: Pick<Quest, 'id'>): Promise<readonly string[] | undefined> {
  const plot = ctx.world.quests.get(quest.id)?.plot;
  if (plot === undefined) return undefined;
  try {
    return await ctx.deps.plots.touched(plot);
  } catch {
    return undefined;
  }
}

/**
 * Writes the minimal letter of a cut session, unless the quest has one with something in it. A letter that cannot be
 * written costs a line in the log, never the move to the infirmary.
 */
export async function writeStopLetter(
  ctx: Context,
  quest: Pick<Quest, 'id'>,
  by: Cut,
  left: StopLeft,
): Promise<void> {
  try {
    const letter = await readHandover(ctx.root, quest.id);
    if (letter !== null && letter.trim() !== '') return;
    const text =
      left.status === 'refused'
        ? stopLetterOf(quest, by, left)
        : cutLetterOf(quest, by, left, await filesOf(ctx, quest));
    await writeFileAtomic(handoverPath(ctx.root, quest.id), text);
    ctx.deps.log.warn(`steward: ${quest.id}: ${by.character} left no handover.md: wrote a minimal one`);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no minimal handover.md: ${messageOf(error)}`);
  }
}
