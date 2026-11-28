// What the day's ledger reads of the log, and the chronicle's bound (P2-06).
import type { LedgerKind } from '../schema/chronicle/ledger.ts';

/**
 * The event types the ledger reads, each to its entry's kind; every other line is left out. A table, not a switch, so
 * a type the chronicle should tell is one more row.
 */
export const LEDGER_TABLE: ReadonlyMap<string, LedgerKind> = new Map<string, LedgerKind>([
  ['quest.done', 'quest_done'],
  ['quest.returned', 'quest_returned'],
  ['quest.sealed', 'quest_sealed'],
  ['quest.infirmary', 'quest_infirmary'],
  ['quest.delivered', 'quest_delivered'],
  ['delivery.merged', 'quest_merged'],
  ['verdict.pass', 'verdict_pass'],
  ['verdict.fail', 'verdict_fail'],
  ['character.level_up', 'level_up'],
  ['character.level_down', 'level_down'],
  ['mana.exhausted', 'pool_asleep'],
  ['mana.restored', 'pool_awake'],
]);

/**
 * The longest chronicle text checkChronicle passes, in characters: the Bard's prose of P2-06b is asked for under 600
 * words, which this leaves room for in Vietnamese or English.
 */
export const CHRONICLE_TEXT_MAX = 6000;

/**
 * (P2-06b) The class whose first character writes the day's prose: the default registry's `bard`. An id of the data,
 * as the plan names it, not a switch on the class: a kingdom without it has no prose.
 */
export const BARD_CLASS = 'bard';

/**
 * (P2-06b) The most of the day's ledger the Bard's prompt holds, in characters of its JSON lines: about 3 000 tokens,
 * so the session stays near 10 000 tokens a day (W10). Entries past it are left out and counted.
 */
export const CHRONICLE_PROMPT_LEDGER_MAX = 12_000;

/** (P2-06b) The words the Bard's prose is asked to stay under; CHRONICLE_TEXT_MAX holds the check. */
export const CHRONICLE_PROSE_WORDS_MAX = 600;

/** `yyyy-mm-dd` of `zone.format`'s ISO text. */
export const LOCAL_DAY_LENGTH = 'yyyy-mm-dd'.length;
