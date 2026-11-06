// Reputation, expertise and title are derived from the verdict windows, never stored (implementation-plan §2.6,
// ADR 0002, ADR 0020): the files keep the last 20 verdicts, these functions read them.
import { HUMAN_VERDICT_WEIGHT, TITLE_MIN_PCT, TITLE_MIN_VERDICTS } from './constants.ts';
import type { TagId } from '../core/ids.ts';
import type { Character, VerdictEntry } from '../schema/character/character.ts';

/** How a character stands over some verdicts. */
export interface Standing {
  /** Verdicts counted, each once whatever its weight (the "≥ 10 verdicts" of a level-up). */
  readonly verdicts: number;
  /** Weighted pass rate, 0–100 (`--rep` of the avatar ring); null before the first verdict. */
  readonly pct: number | null;
}

const weightOf = (entry: VerdictEntry): number => (entry.by_human ? HUMAN_VERDICT_WEIGHT : 1);

/** Pass rate over `window`, where the owner's verdict (royal seal or return) weighs three agent verdicts. */
export function reputationOf(window: readonly VerdictEntry[]): Standing {
  const total = window.reduce((sum, entry) => sum + weightOf(entry), 0);
  const passed = window.reduce((sum, entry) => sum + (entry.result === 'pass' ? weightOf(entry) : 0), 0);
  return { verdicts: window.length, pct: total === 0 ? null : (passed * 100) / total };
}

/**
 * The character's standing on the tags of a quest: the windows of those tags pooled, same weights as
 * reputationOf. The Steward ranks candidates of the required class by it (§3.1).
 */
export const affinityOf = (skillAffinity: Character['skill_affinity'], tags: readonly TagId[]): Standing =>
  reputationOf(tags.flatMap((tag) => skillAffinity[tag]?.window ?? []));

interface Ranked {
  readonly tag: TagId;
  readonly verdicts: number;
  readonly pct: number;
}

const proven = (tag: TagId, standing: Standing): Ranked[] =>
  standing.pct !== null && standing.verdicts >= TITLE_MIN_VERDICTS && standing.pct >= TITLE_MIN_PCT
    ? [{ tag, verdicts: standing.verdicts, pct: standing.pct }]
    : [];

/** Best rate first, then more verdicts, then tag id, so the title never flickers between equals. */
const byStanding = (a: Ranked, b: Ranked): number =>
  b.pct - a.pct || b.verdicts - a.verdicts || a.tag.localeCompare(b.tag, 'en');

/**
 * The tag shown as the character's title: the pinned tag, else the tag with the best proven standing, else
 * none. The display string comes from theme data; the title itself is never stored.
 */
export function titleOf(character: Pick<Character, 'pinned_tag' | 'skill_affinity'>): TagId | null {
  if (character.pinned_tag !== null) return character.pinned_tag;
  // The keys of skill_affinity were parsed as TagIds; Object.entries widens them to string.
  const entries = Object.entries(character.skill_affinity) as [TagId, { window: VerdictEntry[] }][];
  const ranked = entries.flatMap(([tag, { window }]) => proven(tag, reputationOf(window))).sort(byStanding);
  return ranked[0]?.tag ?? null;
}
