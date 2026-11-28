// buildChroniclePrompt: the Bard's session of the chronicle (P2-06b, W10; ADR 0017). Like the Temple's (temple.ts), a
// session with no tool and one task: the system part says what the prose may tell and how long it is; the user part
// holds the day's ledger as framed data, one JSON line an entry, cut at CHRONICLE_PROMPT_LEDGER_MAX characters, and on
// the second try the errors checkChronicle found in the first. The reply is plain text. The Bard's class prompt is
// left out: it is the craft of a quest's drafts written to a file, which this session has none of.
import { CHRONICLE_PROMPT_LEDGER_MAX, CHRONICLE_PROSE_WORDS_MAX, CHRONICLE_TEXT_MAX } from '@elvaria/domain';
import type { ChronicleLedger, LedgerEntry } from '@elvaria/domain';

import { LANGUAGE_NAMES, decreeBlock } from './blocks.ts';
import { fill, joinBlocks } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Locale } from './blocks.ts';
import type { PromptTemplates } from './templates.ts';

export interface ChronicleContext {
  readonly locale: Locale;
  readonly decree: string | null;
  /** The kingdom's name, the chronicle's heading. */
  readonly kingdom: string;
  readonly ledger: ChronicleLedger;
  /** What was wrong with the first try, one line each; empty on the first. */
  readonly issues: readonly string[];
}

/** The entries that fit, as JSON lines, and how many were left out for room. */
function entriesOf(entries: readonly LedgerEntry[]): { readonly lines: string[]; readonly left: number } {
  const lines: string[] = [];
  let size = 0;
  for (const entry of entries) {
    const line = JSON.stringify(entry);
    if (size + line.length + 1 > CHRONICLE_PROMPT_LEDGER_MAX) break;
    lines.push(line);
    size += line.length + 1;
  }
  return { lines, left: entries.length - lines.length };
}

const countsOf = (ledger: ChronicleLedger): string => {
  const kinds = Object.entries(ledger.counts).filter(([, count]) => count > 0);
  const text = kinds.map(([kind, count]) => `${kind} ${String(count)}`).join(', ');
  return `${String(ledger.entries.length)} entries, ${String(ledger.quests)} quests: ${text}.`;
};

const issuesBlock = (issues: readonly string[]): string =>
  issues.length === 0
    ? ''
    : [
        '# Your first try was refused',
        '',
        'Write the tale again without these errors:',
        '',
        ...issues.map((issue) => `- ${issue}`),
      ].join('\n');

export function buildChroniclePrompt(context: ChronicleContext, t: PromptTemplates): BuiltPrompt {
  const { ledger } = context;
  const role = fill(t.chronicle, {
    language: LANGUAGE_NAMES[context.locale],
    words_max: String(CHRONICLE_PROSE_WORDS_MAX),
    chars_max: String(CHRONICLE_TEXT_MAX),
  });
  const { lines, left } = entriesOf(ledger.entries);
  const names = ledger.characters.map(({ name }) => name);
  return {
    system: joinBlocks([decreeBlock(context.decree, t), role]),
    user: fill(t['chronicle-context'], {
      kingdom: context.kingdom,
      day: ledger.day,
      tz: ledger.tz,
      counts: countsOf(ledger),
      entries: lines.join('\n'),
      omitted: left === 0 ? '' : `${String(left)} more entries were left out for room: do not guess them.`,
      characters: names.length === 0 ? 'none' : names.join(', '),
      issues: issuesBlock(context.issues),
    }),
  };
}
