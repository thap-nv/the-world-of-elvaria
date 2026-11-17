// The advisories an assignee reads (PS-09c, implementation-plan §3.16.2, ADR 0024): memos the Steward wrote as other
// quests of the territory reached the base branch, changing files this quest's scope may hold. A block of its own
// (`advisories`, PROMPT_BLOCK_IDS), after the quest's, or after the answer of a resumed session, so the load trace
// counts it apart (PS-01b). Capped: the newest few, within a size; one line counts the rest. The Steward records every
// advisory it gave, shown or counted, so none comes back (memo.delivered).
import { fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Memo } from '@elvaria/domain';

/** At most this many advisories in the block, the newest: older ones changed what newer ones read already. */
export const ADVISORY_BLOCK_MAX_MEMOS = 5;
/** Their text together, past which the older ones are counted instead (about a thousand tokens). */
export const ADVISORY_BLOCK_MAX_CHARS = 4000;

/** An advisory as the assignee reads it: its files are those its quest's scope may hold (advisoryRefsFor). */
export type PromptAdvisory = Pick<Memo, 'id' | 'quest' | 'body' | 'refs' | 'filed_at'>;

const ELLIPSIS = '…';

const paths = (refs: readonly string[]): string =>
  refs.length === 0 ? 'none named' : refs.map((ref) => `\`${ref}\``).join(', ');

const entryOf = ({ id, quest, body, refs, filed_at: filedAt }: PromptAdvisory): string =>
  `## \`${id}\`, as quest \`${quest}\` reached the base branch (${filedAt})\n\n${body.trim()}\n\n- Files: ${paths(refs)}`;

/** The entries shown, newest first: the first always, cut to the cap; the next ones while they fit. */
function shownOf(advisories: readonly PromptAdvisory[]): string[] {
  const shown: string[] = [];
  let used = 0;
  for (const advisory of advisories.slice(0, ADVISORY_BLOCK_MAX_MEMOS)) {
    const entry = entryOf(advisory);
    if (shown.length === 0 && entry.length > ADVISORY_BLOCK_MAX_CHARS)
      return [`${entry.slice(0, ADVISORY_BLOCK_MAX_CHARS - ELLIPSIS.length)}${ELLIPSIS}`];
    if (used + entry.length > ADVISORY_BLOCK_MAX_CHARS) break;
    shown.push(entry);
    used += entry.length;
  }
  return shown;
}

/** The block of `advisories`, newest first; empty without any. */
export function advisoriesBlock(
  advisories: readonly PromptAdvisory[] | undefined,
  t: PromptTemplates,
): string {
  if (advisories === undefined || advisories.length === 0) return '';
  const shown = shownOf(advisories);
  const rest = advisories.length - shown.length;
  const more =
    rest === 0
      ? []
      : [
          `And ${String(rest)} older advisories, not shown: their quests reached the base branch before these.`,
        ];
  return fill(t.advisories, { advisories: [...shown, ...more].join('\n\n') });
}
