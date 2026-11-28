// The machine's check of a chronicle text against the day's ledger (P2-06, ADR 0017): the text may word the facts as it
// likes, but it names no quest the ledger does not hold and no character of the roster who did nothing that day, and it
// stays within its bound. P2-06b's Bard writes prose that must pass this, or the machine's part stands alone.
import { QUEST_ID_PATTERN } from '../core/ids.ts';
import { CHRONICLE_TEXT_MAX } from './constants.ts';
import type { CharacterRef, ChronicleLedger } from '../schema/chronicle/ledger.ts';

export type ChronicleIssue =
  | { readonly code: 'unknown_quest'; readonly quest: string }
  | { readonly code: 'idle_character'; readonly name: string }
  | { readonly code: 'too_long'; readonly length: number; readonly max: number };

/** A quest id anywhere in a text: QUEST_ID_PATTERN without its anchors. */
const QUEST_IDS = new RegExp(QUEST_ID_PATTERN.source.slice(1, -1), 'g');

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `name` as a whole word: no letter, digit or `_` of any script right before or after it. Names keep their case. */
const mentions = (text: string, name: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(name)}(?![\\p{L}\\p{N}_])`, 'u').test(text);

/**
 * The issues of `text` against `ledger`, each once, in the order above; none: it passes. `roster` is the kingdom's
 * characters: a name outside it is not a character's, and passes.
 */
export function checkChronicle(
  text: string,
  ledger: ChronicleLedger,
  roster: readonly CharacterRef[],
): ChronicleIssue[] {
  const quests = new Set<string>(ledger.entries.flatMap(({ quest }) => (quest === undefined ? [] : [quest])));
  const active = new Set(ledger.characters.map(({ id }) => id));
  const unknown = new Set([...text.matchAll(QUEST_IDS)].map(([id]) => id).filter((id) => !quests.has(id)));
  const idle = new Set(
    roster.filter(({ id, name }) => !active.has(id) && mentions(text, name)).map(({ name }) => name),
  );
  return [
    ...[...unknown].map((quest) => ({ code: 'unknown_quest' as const, quest })),
    ...[...idle].map((name) => ({ code: 'idle_character' as const, name })),
    ...(text.length > CHRONICLE_TEXT_MAX
      ? [{ code: 'too_long' as const, length: text.length, max: CHRONICLE_TEXT_MAX }]
      : []),
  ];
}
