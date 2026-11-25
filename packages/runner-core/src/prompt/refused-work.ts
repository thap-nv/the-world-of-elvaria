// What the Steward could not take of the run before a session (P1-31, fix/session-notes): the patch it did not apply,
// or the commit git refused while the quest waited on the doer's amendment (PS-22b) or that went back for a heal
// (ADR 0034). The session that goes on reads why, in its continuation (fresh) or after the decision on its amendment
// (resumed): the run that wrote the work ended before the Steward tried, so no session saw the reason, and the letter
// says the work was done.
import { PATCH_FILE } from '../plot/patch.ts';
import { fenced, fill, joinBlocks } from './templates.ts';
import type { PromptTemplates } from './templates.ts';

/** Why the work of the run before was not taken, each masked as the journal line it comes from. */
export interface RefusedWork {
  /** Why the Steward did not apply that run's patch; absent when it applied it or none came. */
  readonly refused_patch?: string | undefined;
  /**
   * What git said when the Steward's commit of the run's work failed and the run goes on: its first lines, while the
   * quest waited on its amendment (the quest's blocked line); the refused commit's log, masked and cut, after a heal
   * was due (ADR 0034). A commit refused on a submit that was not healed is the infirmary's, with its own reason.
   */
  readonly refused_commit?: string | undefined;
}

const present = (text: string | undefined): text is string => text !== undefined && text.trim() !== '';

/** Why the last run's patch was not applied (P1-31), for the session after it; empty when it was, or there was none. */
export function refusedPatchBlock(why: string | undefined, t: PromptTemplates): string {
  if (!present(why)) return '';
  return fill(t['refused-patch'], { patch_file: PATCH_FILE, why: fenced(why.trim(), 'text') });
}

/** Why the last run's work is not committed (fix/session-notes); empty when it was, or the run did not wait. */
export function refusedCommitBlock(why: string | undefined, t: PromptTemplates): string {
  if (!present(why)) return '';
  return fill(t['refused-commit'], { why: fenced(why.trim(), 'text') });
}

/** Both, in the order the Steward tries them: no commit is tried after a refused patch. */
export const refusedWorkBlock = (work: RefusedWork, t: PromptTemplates): string =>
  joinBlocks([refusedPatchBlock(work.refused_patch, t), refusedCommitBlock(work.refused_commit, t)]);
